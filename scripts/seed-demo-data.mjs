/**
 * Development / demo sample data seed for MobilePOS.
 *
 * Safety:
 * - Refuses by default (requires ALLOW_DEMO_SEED=1 or --allow-demo-seed)
 * - Refuses NODE_ENV=production unless ALLOW_DEMO_SEED_IN_PRODUCTION=1
 * - Never prints DATABASE_URL / service-role secrets
 * - Does not live in schema migrations
 * - Transactional data goes through existing RPCs (no direct stock/payment forgery)
 *
 * Usage:
 *   ALLOW_DEMO_SEED=1 DEMO_SEED_PASSWORD=... npm run seed:demo
 *   ALLOW_DEMO_SEED=1 ALLOW_DEMO_REALISM_REFRESH=1 DEMO_SEED_PASSWORD=... npm run seed:demo -- --refresh-realism
 *
 * Optional:
 *   DEMO_ORG_ID / DEMO_SHOP_ID — seed into an existing org/shop you own
 *   DEMO_SEED_CREATE_STAFF=1 — also create demo admin/cashier/technician auth users
 *   --refresh-realism / ALLOW_DEMO_REALISM_REFRESH=1 — wipe demo transactions and re-seed with realistic LKR data
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  DEMO_ORG_NAME,
  DEMO_SHOP_NAME,
  SKU_PREFIX,
  DEMO_EMAIL_DOMAIN,
  STAFF_PROFILES,
  CUSTOMER_DEFS,
  PRODUCT_PRICE_OVERRIDES,
  SERVICE_LABOR_OVERRIDES,
  syntheticImei,
  syntheticSerial,
  barcode,
  PHOTO_SET_MARKERS,
} from "./lib/demo-realism.mjs";
import { wipeDemoTransactions } from "./lib/wipe-demo-transactions.mjs";

const OWNER_EMAIL = `owner@${DEMO_EMAIL_DOMAIN}`;
const STAFF_EMAILS = {
  admin: `admin@${DEMO_EMAIL_DOMAIN}`,
  cashier: `cashier@${DEMO_EMAIL_DOMAIN}`,
  technician: `technician@${DEMO_EMAIL_DOMAIN}`,
};

const args = new Set(process.argv.slice(2));
const allowFlag = args.has("--allow-demo-seed");
const forceReseed = args.has("--force");
const refreshRealism =
  args.has("--refresh-realism") || process.env.ALLOW_DEMO_REALISM_REFRESH === "1";

function loadEnv() {
  const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  return Object.fromEntries(
    raw
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const i = line.indexOf("=");
        return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
      }),
  );
}

function assertSafetyGuards(env) {
  const allow =
    allowFlag ||
    env.ALLOW_DEMO_SEED === "1" ||
    process.env.ALLOW_DEMO_SEED === "1";
  if (!allow) {
    throw new Error(
      "Refusing demo seed. Set ALLOW_DEMO_SEED=1 or pass --allow-demo-seed. This script is development/demo only.",
    );
  }

  const nodeEnv = process.env.NODE_ENV || env.NODE_ENV || "";
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || env.NEXT_PUBLIC_APP_URL || "").toLowerCase();
  const looksProd =
    nodeEnv === "production" ||
    (appUrl &&
      !appUrl.includes("localhost") &&
      !appUrl.includes("127.0.0.1") &&
      !appUrl.includes(".local"));

  if (looksProd) {
    const override =
      process.env.ALLOW_DEMO_SEED_IN_PRODUCTION === "1" ||
      env.ALLOW_DEMO_SEED_IN_PRODUCTION === "1";
    if (!override) {
      throw new Error(
        "Refusing demo seed against a production-like environment. Set ALLOW_DEMO_SEED_IN_PRODUCTION=1 only if you intentionally accept the risk.",
      );
    }
  }

  const password = process.env.DEMO_SEED_PASSWORD || env.DEMO_SEED_PASSWORD;
  if (!password || password.length < 10) {
    throw new Error(
      "DEMO_SEED_PASSWORD is required (min 10 chars). Do not commit passwords to source.",
    );
  }
  return password;
}

function rpc(sb, name, params = {}) {
  return sb.rpc(name, params);
}

function fail(step, error) {
  const message = error?.message || String(error);
  throw new Error(`[${step}] ${message}`);
}

async function ensureAuthUser(admin, email, password, firstName) {
  const { data: listed } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const existing = listed?.users?.find((u) => u.email === email);
  if (existing) {
    await admin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: { first_name: firstName },
    });
    return existing;
  }
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { first_name: firstName },
  });
  if (error) fail(`createUser ${email}`, error);
  return data.user;
}

async function signIn(url, anon, email, password) {
  const sb = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.session) fail(`signIn ${email}`, error || new Error("no session"));
  return sb;
}

async function upsertByName(sb, table, rows) {
  const out = {};
  for (const row of rows) {
    const { data: existing } = await sb
      .from(table)
      .select("id, name")
      .eq("name", row.name)
      .maybeSingle();
    if (existing?.id) {
      out[row.name] = existing;
      continue;
    }
    const { data, error } = await sb.from(table).insert(row).select("id, name").single();
    if (error) fail(`insert ${table} ${row.name}`, error);
    out[row.name] = data;
  }
  return out;
}

async function main() {
  const env = { ...loadEnv(), ...process.env };
  const password = assertSafetyGuards(env);

  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / ANON_KEY / SERVICE_ROLE_KEY");
  }

  const admin = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log("Demo seed: ensuring demo owner account…");
  const ownerUser = await ensureAuthUser(
    admin,
    OWNER_EMAIL,
    password,
    STAFF_PROFILES.owner.first,
  );
  let owner = await signIn(url, anon, OWNER_EMAIL, password);

  let orgId = env.DEMO_ORG_ID || null;
  let shopId = env.DEMO_SHOP_ID || null;

  if (orgId || shopId) {
    if (!orgId || !shopId) {
      throw new Error("Provide both DEMO_ORG_ID and DEMO_SHOP_ID, or neither.");
    }
    const { data: profile } = await owner
      .from("profiles")
      .select("organization_id, role")
      .eq("id", ownerUser.id)
      .maybeSingle();
    if (profile?.organization_id !== orgId) {
      throw new Error("Signed-in demo owner does not belong to DEMO_ORG_ID. Do not guess UUIDs.");
    }
  } else {
    const { data: profile } = await owner
      .from("profiles")
      .select("organization_id, default_shop_id, role")
      .eq("id", ownerUser.id)
      .maybeSingle();

    if (!profile?.organization_id) {
      const boot = await rpc(owner, "bootstrap_organization", { p_name: DEMO_ORG_NAME });
      if (boot.error) fail("bootstrap_organization", boot.error);
      orgId = boot.data;
    } else {
      orgId = profile.organization_id;
      const { data: org } = await owner
        .from("organizations")
        .select("id, name")
        .eq("id", orgId)
        .single();
      if (org?.name !== DEMO_ORG_NAME) {
        throw new Error(
          `Demo owner already belongs to org "${org?.name}". Use a fresh owner or set DEMO_ORG_ID/DEMO_SHOP_ID explicitly.`,
        );
      }
    }

    const { data: shop } = await owner.from("shops").select("id, name").limit(1).single();
    shopId = shop.id;
    if (shop.name !== DEMO_SHOP_NAME) {
      const renamed = await owner
        .from("shops")
        .update({ name: DEMO_SHOP_NAME })
        .eq("id", shopId)
        .select("id")
        .single();
      if (renamed.error) fail("rename shop", renamed.error);
    }
  }

  const { count: existingProducts } = await owner
    .from("products")
    .select("id", { count: "exact", head: true })
    .like("sku", `${SKU_PREFIX}%`);
  const { count: existingRepairs } = await owner
    .from("repair_jobs")
    .select("id", { count: "exact", head: true })
    .eq("shop_id", shopId);
  const { count: existingSales } = await owner
    .from("sales")
    .select("id", { count: "exact", head: true })
    .eq("shop_id", shopId);

  const seedComplete =
    (existingProducts ?? 0) >= 20 &&
    (existingRepairs ?? 0) >= 10 &&
    (existingSales ?? 0) >= 10;

  if (refreshRealism) {
    console.log("Demo seed: --refresh-realism — wiping demo transactions…");
    const wiped = await wipeDemoTransactions(admin, { orgId, shopId });
    console.log(
      `Wiped demo transactions: repairs=${wiped.repairs}, sales=${wiped.sales}, purchases=${wiped.purchases}`,
    );
  } else if (seedComplete && !forceReseed) {
    console.log(
      `Demo dataset already present (products=${existingProducts}, repairs=${existingRepairs}, sales=${existingSales}). Skipping.`,
    );
    await printSummary(owner, orgId, shopId, { skipped: true });
    return;
  }
  if ((existingProducts ?? 0) > 0 && forceReseed) {
    throw new Error(
      "Refusing --force reseed while DEMO-* products exist. This script does not bulk-delete org data. Create a new demo owner/org or remove the demo org in the dashboard.",
    );
  }

  // Resume-safe: if products already exist from a partial run, reuse them and continue transactional seeding.
  // refreshRealism treats the dataset as incomplete so purchases/sales/repairs are re-seeded.
  const resuming =
    (existingProducts ?? 0) >= 20 && (!seedComplete || refreshRealism);
  if (resuming) {
    console.log(
      `Resuming incomplete demo seed (products=${existingProducts}, repairs=${refreshRealism ? 0 : existingRepairs}, sales=${refreshRealism ? 0 : existingSales})…`,
    );
  }

  // Staff (optional, always on realism refresh)
  let techUserId = null;
  const createStaff =
    refreshRealism ||
    env.DEMO_SEED_CREATE_STAFF === "1" ||
    process.env.DEMO_SEED_CREATE_STAFF === "1";
  if (createStaff) {
    for (const [role, email] of Object.entries(STAFF_EMAILS)) {
      const profile = STAFF_PROFILES[role];
      const user = await ensureAuthUser(admin, email, password, profile.first);
      const assigned = await rpc(owner, "assign_staff_profile", {
        p_user_id: user.id,
        p_role: role,
        p_shop_id: shopId,
        p_first_name: profile.first,
        p_last_name: profile.last,
      });
      if (assigned.error && !/already|exists|profile/i.test(assigned.error.message || "")) {
        // Re-sign-in owner in case session stale; assignment may fail if profile exists — try update path
        console.warn(`assign ${role}: ${assigned.error.message}`);
      }
      // Keep profile names current on refresh even if assign was a no-op
      await admin
        .from("profiles")
        .update({ first_name: profile.first, last_name: profile.last })
        .eq("id", user.id);
      if (role === "technician") techUserId = user.id;
    }
    await admin
      .from("profiles")
      .update({
        first_name: STAFF_PROFILES.owner.first,
        last_name: STAFF_PROFILES.owner.last,
      })
      .eq("id", ownerUser.id);
    owner = await signIn(url, anon, OWNER_EMAIL, password);
  } else {
    await admin
      .from("profiles")
      .update({
        first_name: STAFF_PROFILES.owner.first,
        last_name: STAFF_PROFILES.owner.last,
      })
      .eq("id", ownerUser.id);
  }

  // ---------- Master data ----------
  const categories = await upsertByName(owner, "categories", [
    { name: "Screens", sort_order: 10 },
    { name: "Batteries", sort_order: 20 },
    { name: "Charging", sort_order: 30 },
    { name: "Cameras", sort_order: 40 },
    { name: "Audio", sort_order: 50 },
    { name: "Cables & Chargers", sort_order: 60 },
    { name: "Cases & Protection", sort_order: 70 },
    { name: "Power", sort_order: 80 },
    { name: "Tools & Kits", sort_order: 90 },
  ]);

  const productBrands = await upsertByName(owner, "brands", [
    { name: "DemoParts Co" },
    { name: "DemoAccessories" },
    { name: "Generic OEM" },
  ]);

  const deviceBrandRows = [
    { name: "Apple" },
    { name: "Samsung" },
    { name: "Google" },
    { name: "Xiaomi" },
    { name: "OnePlus" },
  ];
  const deviceBrands = await upsertByName(owner, "device_brands", deviceBrandRows);

  const modelDefs = [
    ["Apple", "iPhone 13"],
    ["Apple", "iPhone 14"],
    ["Apple", "iPhone 15"],
    ["Samsung", "Galaxy S23"],
    ["Samsung", "Galaxy A54"],
    ["Google", "Pixel 7"],
    ["Google", "Pixel 8"],
    ["Xiaomi", "Redmi Note 12"],
    ["OnePlus", "Nord CE 3"],
  ];
  const deviceModels = {};
  for (const [brandName, modelName] of modelDefs) {
    const brand = deviceBrands[brandName];
    const { data: existing } = await owner
      .from("device_models")
      .select("id, name")
      .eq("device_brand_id", brand.id)
      .eq("name", modelName)
      .maybeSingle();
    if (existing) {
      deviceModels[modelName] = existing;
      continue;
    }
    const { data, error } = await owner
      .from("device_models")
      .insert({
        device_brand_id: brand.id,
        name: modelName,
        device_type: "phone",
      })
      .select("id, name")
      .single();
    if (error) fail(`device_model ${modelName}`, error);
    deviceModels[modelName] = data;
  }

  const suppliers = {};
  const supplierDefs = [
    {
      name: "Demo Display Parts Ltd",
      contact_person: "Alex Parts",
      phone: "+94 11 200 0001",
      email: "parts@demo-suppliers.example",
      address: "100 Fiction Ave",
    },
    {
      name: "Demo Battery Hub",
      contact_person: "Blake Cell",
      phone: "+94 11 200 0002",
      email: "batteries@demo-suppliers.example",
    },
    {
      name: "Demo Accessory Wholesale",
      contact_person: "Casey Cable",
      phone: "+94 11 200 0003",
      email: "cables@demo-suppliers.example",
    },
    {
      name: "Demo General Electronics",
      contact_person: "Dana Supply",
      phone: "+94 11 200 0004",
      email: "general@demo-suppliers.example",
    },
    {
      name: "Demo Camera Modules Inc",
      contact_person: "Ellis Lens",
      phone: "+94 11 200 0005",
      email: "camera@demo-suppliers.example",
    },
  ];
  for (const s of supplierDefs) {
    const { data: existing } = await owner
      .from("suppliers")
      .select("id, name, phone")
      .eq("name", s.name)
      .maybeSingle();
    if (existing) {
      if (refreshRealism || existing.phone !== s.phone) {
        await owner.from("suppliers").update({ phone: s.phone }).eq("id", existing.id);
      }
      suppliers[s.name] = existing;
      continue;
    }
    const { data, error } = await owner.from("suppliers").insert(s).select("id, name").single();
    if (error) fail(`supplier ${s.name}`, error);
    suppliers[s.name] = data;
  }

  // Products (≈32)
  const productDefs = [
    // spare parts
    { sku: "SCR-IP13", name: "iPhone 13 OLED Screen", type: "spare_part", cat: "Screens", brand: "DemoParts Co", price: 180, cost: 95, min: 2, models: ["iPhone 13"], stockTarget: 8 },
    { sku: "SCR-IP14", name: "iPhone 14 OLED Screen", type: "spare_part", cat: "Screens", brand: "DemoParts Co", price: 210, cost: 110, min: 2, models: ["iPhone 14"], stockTarget: 6 },
    { sku: "SCR-IP15", name: "iPhone 15 OLED Screen", type: "spare_part", cat: "Screens", brand: "DemoParts Co", price: 240, cost: 130, min: 2, models: ["iPhone 15"], stockTarget: 5 },
    { sku: "SCR-S23", name: "Galaxy S23 Screen", type: "spare_part", cat: "Screens", brand: "DemoParts Co", price: 160, cost: 85, min: 2, models: ["Galaxy S23"], stockTarget: 7 },
    { sku: "SCR-PXL7", name: "Pixel 7 Screen", type: "spare_part", cat: "Screens", brand: "Generic OEM", price: 140, cost: 70, min: 2, models: ["Pixel 7"], stockTarget: 4 },
    { sku: "BAT-IP13", name: "iPhone 13 Battery", type: "spare_part", cat: "Batteries", brand: "DemoParts Co", price: 55, cost: 22, min: 3, models: ["iPhone 13", "iPhone 14"], stockTarget: 12 },
    { sku: "BAT-IP15", name: "iPhone 15 Battery", type: "spare_part", cat: "Batteries", brand: "DemoParts Co", price: 65, cost: 28, min: 3, models: ["iPhone 15"], stockTarget: 10 },
    { sku: "BAT-S23", name: "Galaxy S23 Battery", type: "spare_part", cat: "Batteries", brand: "Generic OEM", price: 48, cost: 18, min: 3, models: ["Galaxy S23", "Galaxy A54"], stockTarget: 9 },
    { sku: "CHG-IP", name: "Lightning Charging Port", type: "spare_part", cat: "Charging", brand: "Generic OEM", price: 35, cost: 12, min: 2, models: ["iPhone 13", "iPhone 14"], stockTarget: 8 },
    { sku: "CHG-USB", name: "USB-C Charging Port Module", type: "spare_part", cat: "Charging", brand: "Generic OEM", price: 32, cost: 11, min: 2, models: ["Galaxy S23", "Pixel 7", "Pixel 8", "OnePlus Nord CE 3"], stockTarget: 10 },
    { sku: "CAM-IP14", name: "iPhone 14 Rear Camera", type: "spare_part", cat: "Cameras", brand: "DemoParts Co", price: 95, cost: 45, min: 1, models: ["iPhone 14"], stockTarget: 3 },
    { sku: "CAM-PXL8", name: "Pixel 8 Camera Module", type: "spare_part", cat: "Cameras", brand: "Generic OEM", price: 88, cost: 40, min: 1, models: ["Pixel 8"], stockTarget: 3 },
    { sku: "SPK-IP", name: "iPhone Loudspeaker", type: "spare_part", cat: "Audio", brand: "Generic OEM", price: 28, cost: 9, min: 2, models: ["iPhone 13", "iPhone 14", "iPhone 15"], stockTarget: 6 },
    { sku: "SPK-AND", name: "Android Earpiece Speaker", type: "spare_part", cat: "Audio", brand: "Generic OEM", price: 22, cost: 7, min: 2, models: ["Galaxy S23", "Galaxy A54", "Redmi Note 12"], stockTarget: 5 },
    // accessories
    { sku: "CBL-USBC", name: "USB-C Cable 1m", type: "accessory", cat: "Cables & Chargers", brand: "DemoAccessories", price: 12, cost: 3, min: 5, models: [], stockTarget: 40 },
    { sku: "CBL-LTN", name: "Lightning Cable 1m", type: "accessory", cat: "Cables & Chargers", brand: "DemoAccessories", price: 14, cost: 4, min: 5, models: [], stockTarget: 35 },
    { sku: "CHG-20W", name: "20W USB-C Charger", type: "accessory", cat: "Cables & Chargers", brand: "DemoAccessories", price: 25, cost: 9, min: 4, models: [], stockTarget: 20 },
    { sku: "CHG-30W", name: "30W Fast Charger", type: "accessory", cat: "Cables & Chargers", brand: "DemoAccessories", price: 35, cost: 12, min: 3, models: [], stockTarget: 15 },
    { sku: "CSE-IP14", name: "iPhone 14 Clear Case", type: "accessory", cat: "Cases & Protection", brand: "DemoAccessories", price: 18, cost: 5, min: 4, models: ["iPhone 14"], stockTarget: 25 },
    { sku: "CSE-S23", name: "Galaxy S23 Rugged Case", type: "accessory", cat: "Cases & Protection", brand: "DemoAccessories", price: 22, cost: 6, min: 4, models: ["Galaxy S23"], stockTarget: 18 },
    { sku: "GLS-IP15", name: "iPhone 15 Screen Protector", type: "accessory", cat: "Cases & Protection", brand: "DemoAccessories", price: 10, cost: 2, min: 6, models: ["iPhone 15"], stockTarget: 50 },
    { sku: "GLS-UNI", name: "Universal Tempered Glass Pack", type: "accessory", cat: "Cases & Protection", brand: "DemoAccessories", price: 8, cost: 1.5, min: 6, models: [], stockTarget: 60 },
    { sku: "PB-10K", name: "10,000mAh Power Bank", type: "accessory", cat: "Power", brand: "DemoAccessories", price: 40, cost: 18, min: 3, models: [], stockTarget: 12 },
    { sku: "PB-20K", name: "20,000mAh Power Bank", type: "accessory", cat: "Power", brand: "DemoAccessories", price: 55, cost: 24, min: 2, models: [], stockTarget: 8 },
    // other
    { sku: "KIT-CLN", name: "Phone Cleaning Kit", type: "other", cat: "Tools & Kits", brand: "DemoAccessories", price: 9, cost: 2, min: 3, models: [], stockTarget: 20 },
    { sku: "TOL-SIM", name: "SIM Eject Tool Pack (5)", type: "other", cat: "Tools & Kits", brand: "Generic OEM", price: 3, cost: 0.5, min: 5, models: [], stockTarget: 30 },
    { sku: "KIT-OPEN", name: "Phone Opening Tool Kit", type: "other", cat: "Tools & Kits", brand: "Generic OEM", price: 28, cost: 10, min: 2, models: [], stockTarget: 6 },
    // intentional low / out after adjustments
    { sku: "SCR-A54", name: "Galaxy A54 Screen", type: "spare_part", cat: "Screens", brand: "DemoParts Co", price: 120, cost: 60, min: 3, models: ["Galaxy A54"], stockTarget: 4, lowAfter: true },
    { sku: "BAT-PXL", name: "Pixel Battery (7/8)", type: "spare_part", cat: "Batteries", brand: "Generic OEM", price: 50, cost: 20, min: 3, models: ["Pixel 7", "Pixel 8"], stockTarget: 5, outAfter: true },
    { sku: "CBL-USBC-3", name: "USB-C Cable 3m", type: "accessory", cat: "Cables & Chargers", brand: "DemoAccessories", price: 16, cost: 4, min: 4, models: [], stockTarget: 10, lowAfter: true },
    { sku: "CSE-PXL", name: "Pixel 8 Soft Case", type: "accessory", cat: "Cases & Protection", brand: "DemoAccessories", price: 15, cost: 4, min: 3, models: ["Pixel 8"], stockTarget: 8 },
    { sku: "MIC-IP", name: "iPhone Microphone Flex", type: "spare_part", cat: "Audio", brand: "Generic OEM", price: 18, cost: 6, min: 2, models: ["iPhone 13", "iPhone 14", "iPhone 15"], stockTarget: 7 },
  ];

  for (const def of productDefs) {
    const override = PRODUCT_PRICE_OVERRIDES[def.sku];
    if (override) {
      def.price = override.price;
      def.cost = override.cost;
    }
  }

  const products = {};
  let skuIndex = 1;
  for (const def of productDefs) {
    const sku = `${SKU_PREFIX}${def.sku}`;
    const { data: existing } = await owner
      .from("products")
      .select("id, sku, selling_price, name")
      .eq("sku", sku)
      .maybeSingle();
    let product = existing;
    if (!product) {
      const { data, error } = await owner
        .from("products")
        .insert({
          sku,
          barcode: barcode(skuIndex),
          name: def.name,
          category_id: categories[def.cat].id,
          brand_id: productBrands[def.brand].id,
          product_type: def.type,
          selling_price: def.price,
          track_inventory: true,
          min_stock: def.min,
          reorder_level: def.min,
          is_active: true,
          is_taxable: false,
          description: "DEMO seed product — fictional catalog item",
          supplier_id: suppliers["Demo Display Parts Ltd"].id,
        })
        .select("id, sku, selling_price, name")
        .single();
      if (error) fail(`product ${sku}`, error);
      product = data;
      const { data: existingCost } = await owner
        .from("product_costs")
        .select("product_id")
        .eq("product_id", product.id)
        .maybeSingle();
      if (!existingCost) {
        await owner.from("product_costs").insert({
          product_id: product.id,
          cost_price: def.cost,
        });
      }
    } else {
      const needsPriceUpdate =
        refreshRealism || Number(existing.selling_price) < 500;
      if (needsPriceUpdate) {
        const { data: updated, error: priceErr } = await owner
          .from("products")
          .update({ selling_price: def.price })
          .eq("id", existing.id)
          .select("id, sku, selling_price, name")
          .single();
        if (priceErr) fail(`update product price ${sku}`, priceErr);
        product = updated;
        const { data: existingCost } = await owner
          .from("product_costs")
          .select("product_id")
          .eq("product_id", product.id)
          .maybeSingle();
        if (existingCost) {
          const { error: costErr } = await owner
            .from("product_costs")
            .update({ cost_price: def.cost })
            .eq("product_id", product.id);
          if (costErr) fail(`update product cost ${sku}`, costErr);
        } else {
          await owner.from("product_costs").insert({
            product_id: product.id,
            cost_price: def.cost,
          });
        }
      }
    }
    products[def.sku] = { ...product, def };
    for (const modelName of def.models || []) {
      const model = deviceModels[modelName];
      if (!model) continue;
      const { data: existingCompat } = await owner
        .from("product_device_compatibility")
        .select("product_id")
        .eq("product_id", product.id)
        .eq("device_model_id", model.id)
        .maybeSingle();
      if (!existingCompat) {
        const { error: compatErr } = await owner.from("product_device_compatibility").insert({
          product_id: product.id,
          device_model_id: model.id,
          organization_id: orgId,
        });
        if (compatErr) fail(`compat ${sku}/${modelName}`, compatErr);
      }
    }
    skuIndex += 1;
  }

  // Repair services
  const serviceDefs = Object.entries(SERVICE_LABOR_OVERRIDES).map(([name, o]) => ({
    name,
    labor: o.labor,
    warranty: o.warranty,
  }));
  const services = {};
  for (const s of serviceDefs) {
    const { data: existing } = await owner
      .from("repair_services")
      .select("id, name, default_labor_charge")
      .eq("name", s.name)
      .maybeSingle();
    if (existing) {
      if (
        refreshRealism ||
        Number(existing.default_labor_charge) !== Number(s.labor)
      ) {
        const { data: updated, error: svcErr } = await owner
          .from("repair_services")
          .update({
            default_labor_charge: s.labor,
            default_warranty_days: s.warranty,
          })
          .eq("id", existing.id)
          .select("id, name, default_labor_charge")
          .single();
        if (svcErr) fail(`update service ${s.name}`, svcErr);
        services[s.name] = updated;
      } else {
        services[s.name] = existing;
      }
      continue;
    }
    const { data, error } = await owner
      .from("repair_services")
      .insert({
        name: s.name,
        default_labor_charge: s.labor,
        default_warranty_days: s.warranty,
        is_active: true,
      })
      .select("id, name, default_labor_charge")
      .single();
    if (error) fail(`service ${s.name}`, error);
    services[s.name] = data;
  }

  // Customers (16 + walk-in)
  const { data: walkIn } = await owner
    .from("customers")
    .select("id, first_name, is_walk_in")
    .eq("is_walk_in", true)
    .maybeSingle();

  const customers = [];
  if (walkIn) customers.push({ ...walkIn, devices: [] });

  let imeiSeq = 1;
  for (const c of CUSTOMER_DEFS) {
    const { data: existing } = await owner
      .from("customers")
      .select("id, first_name, last_name, email, phone")
      .eq("email", c.email)
      .maybeSingle();
    let customer = existing;
    if (!customer) {
      const { data, error } = await owner
        .from("customers")
        .insert({
          shop_id: shopId,
          first_name: c.first,
          last_name: c.last,
          phone: c.phone,
          email: c.email,
          notes: "DEMO seed customer — fictional",
          is_walk_in: false,
        })
        .select("id, first_name, last_name, email")
        .single();
      if (error) fail(`customer ${c.email}`, error);
      customer = data;
    } else {
      const { data: updated, error: custErr } = await owner
        .from("customers")
        .update({
          first_name: c.first,
          last_name: c.last,
          phone: c.phone,
        })
        .eq("id", existing.id)
        .select("id, first_name, last_name, email")
        .single();
      if (custErr) fail(`update customer ${c.email}`, custErr);
      customer = updated;
    }
    const devices = [];
    for (const [brandName, modelName, color] of c.devices) {
      const model = deviceModels[modelName];
      const { data: existingDev } = await owner
        .from("customer_devices")
        .select("id, imei, serial_number")
        .eq("customer_id", customer.id)
        .eq("device_model_id", model.id)
        .maybeSingle();
      if (existingDev) {
        const n = imeiSeq++;
        const { data: updatedDev, error: devErr } = await owner
          .from("customer_devices")
          .update({
            imei: syntheticImei(n),
            serial_number: syntheticSerial(n),
          })
          .eq("id", existingDev.id)
          .select("id")
          .single();
        if (devErr) fail(`update device ${modelName}`, devErr);
        devices.push(updatedDev);
        continue;
      }
      const n = imeiSeq++;
      const { data: device, error } = await owner
        .from("customer_devices")
        .insert({
          customer_id: customer.id,
          device_model_id: model.id,
          device_type: "phone",
          model_label: `${brandName} ${modelName}`,
          color,
          imei: syntheticImei(n),
          serial_number: syntheticSerial(n),
          notes: "DEMO synthetic identifiers",
        })
        .select("id")
        .single();
      if (error) fail(`device ${modelName}`, error);
      devices.push(device);
    }
    customers.push({ ...customer, devices });
  }

  // ---------- Purchases via RPC ----------
  console.log("Demo seed: purchases / receiving…");
  const stockable = Object.values(products).filter((p) => p.def.stockTarget > 0);
  const { count: purchaseCount } = await owner
    .from("purchases")
    .select("id", { count: "exact", head: true })
    .eq("shop_id", shopId)
    .ilike("notes", "DEMO%");

  async function createAndMaybeReceive(label, items, receiveQtyBySku) {
    const purchase = await rpc(owner, "create_purchase", {
      p_payload: {
        supplier_id: suppliers["Demo General Electronics"].id,
        shop_id: shopId,
        notes: `DEMO ${label}`,
        items: items.map((it) => ({
          product_id: products[it.sku].id,
          quantity_ordered: it.qty,
          unit_cost: products[it.sku].def.cost,
        })),
      },
    });
    if (purchase.error) fail(`create_purchase ${label}`, purchase.error);

    if (receiveQtyBySku) {
      const { data: pItems } = await owner
        .from("purchase_items")
        .select("id, product_id")
        .eq("purchase_id", purchase.data);
      const productIdToSku = Object.fromEntries(
        Object.values(products).map((p) => [p.id, p.def.sku]),
      );
      const receiveItems = [];
      for (const row of pItems || []) {
        const sku = productIdToSku[row.product_id];
        const qty = receiveQtyBySku[sku];
        if (qty && qty > 0) {
          receiveItems.push({ purchase_item_id: row.id, quantity: qty });
        }
      }
      if (receiveItems.length) {
        const received = await rpc(owner, "receive_purchase", {
          p_payload: { purchase_id: purchase.data, items: receiveItems },
        });
        if (received.error) fail(`receive_purchase ${label}`, received.error);
      }
    }
    return purchase.data;
  }

  if ((purchaseCount ?? 0) < 2) {
    // Full receive — main stock
    await createAndMaybeReceive(
      "main stock PO",
      stockable.map((p) => ({ sku: p.def.sku, qty: p.def.stockTarget })),
      Object.fromEntries(stockable.map((p) => [p.def.sku, p.def.stockTarget])),
    );

    // Partial receive
    await createAndMaybeReceive(
      "partial PO",
      [
        { sku: "CBL-USBC", qty: 20 },
        { sku: "GLS-UNI", qty: 20 },
      ],
      { "CBL-USBC": 8, "GLS-UNI": 5 },
    );

    // Open / pending (ordered, not received)
    await createAndMaybeReceive(
      "open PO",
      [
        { sku: "PB-10K", qty: 6 },
        { sku: "CHG-30W", qty: 6 },
      ],
      null,
    );

    // Intentional low / out via adjustment (never touch product_stocks directly)
    for (const p of Object.values(products)) {
      if (p.def.outAfter) {
        const { data: stock } = await owner
          .from("product_stocks")
          .select("quantity")
          .eq("product_id", p.id)
          .eq("shop_id", shopId)
          .maybeSingle();
        const qty = Number(stock?.quantity || 0);
        if (qty > 0) {
          const adj = await rpc(owner, "adjust_inventory", {
            p_shop_id: shopId,
            p_product_id: p.id,
            p_quantity_change: -qty,
            p_movement_type: "adjustment",
            p_notes: "DEMO seed: force out-of-stock for UI testing",
          });
          if (adj.error) fail("adjust out-of-stock", adj.error);
        }
      } else if (p.def.lowAfter) {
        const { data: stock } = await owner
          .from("product_stocks")
          .select("quantity")
          .eq("product_id", p.id)
          .eq("shop_id", shopId)
          .maybeSingle();
        const qty = Number(stock?.quantity || 0);
        const target = 1;
        if (qty > target) {
          const adj = await rpc(owner, "adjust_inventory", {
            p_shop_id: shopId,
            p_product_id: p.id,
            p_quantity_change: -(qty - target),
            p_movement_type: "adjustment",
            p_notes: "DEMO seed: force low-stock for UI testing",
          });
          if (adj.error) fail("adjust low-stock", adj.error);
        }
      }
    }
  } else {
    console.log("Purchases already seeded — skipping purchase/adjust section");
  }

  // ---------- Sales ----------
  console.log("Demo seed: retail sales / refunds…");
  const saleIds = [];
  const retailCustomers = customers.filter((c) => !c.is_walk_in);
  const { count: demoSaleCount } = await owner
    .from("sales")
    .select("id", { count: "exact", head: true })
    .eq("shop_id", shopId)
    .ilike("notes", "DEMO%");

  async function sell(items, payments, customerId = null, discount = 0) {
    const subtotal = items.reduce(
      (sum, it) => sum + products[it.sku].def.price * it.qty - (it.lineDiscount || 0),
      0,
    );
    const due = Math.max(0, subtotal - (discount || 0));
    const nonCashTotal = payments
      .filter((p) => p.method !== "cash")
      .reduce((s, p) => s + Number(p.amount || 0), 0);
    const normalizedPayments = payments.map((p) => {
      if (p.method === "cash") {
        const remaining = Math.max(0, due - nonCashTotal);
        const tendered = Math.max(Number(p.tendered_amount || 0), remaining + 10);
        return { ...p, tendered_amount: tendered };
      }
      if (p.amount == null) return { ...p, amount: due };
      return p;
    });
    const payload = {
      shop_id: shopId,
      items: items.map((it) => ({
        product_id: products[it.sku].id,
        quantity: it.qty,
        ...(it.lineDiscount != null ? { discount_amount: it.lineDiscount } : {}),
      })),
      payments: normalizedPayments,
      idempotency_key: crypto.randomUUID(),
      notes: "DEMO seed sale",
    };
    if (customerId) payload.customer_id = customerId;
    if (discount) payload.discount_amount = discount;
    const sale = await rpc(owner, "complete_sale", { p_payload: payload });
    if (sale.error) fail("complete_sale", sale.error);
    saleIds.push(sale.data);
    return sale.data;
  }

  if ((demoSaleCount ?? 0) < 10) {
  // Walk-in cash
  await sell(
    [{ sku: "CBL-USBC", qty: 2 }, { sku: "KIT-CLN", qty: 1 }],
    [{ method: "cash", tendered_amount: 50 }],
  );
  // Customer card — amount computed inside sell() when omitted
  await sell(
    [{ sku: "CSE-IP14", qty: 1 }, { sku: "GLS-IP15", qty: 2 }],
    [{ method: "card" }],
    retailCustomers[0].id,
  );
  // Split
  await sell(
    [{ sku: "PB-10K", qty: 1 }, { sku: "CBL-LTN", qty: 1 }],
    [
      { method: "card", amount: 20 },
      { method: "cash", tendered_amount: 40 },
    ],
    retailCustomers[1].id,
  );
  // Discounted (owner unrestricted)
  await sell(
    [{ sku: "CHG-20W", qty: 2 }],
    [{ method: "cash", tendered_amount: 60 }],
    retailCustomers[2].id,
    5,
  );
  // More variety
  for (let i = 0; i < 12; i += 1) {
    const cust = retailCustomers[i % retailCustomers.length];
    const sku = ["CBL-USBC", "GLS-UNI", "TOL-SIM", "KIT-CLN", "CSE-S23", "CHG-20W"][i % 6];
    const method = i % 3 === 0 ? "card" : i % 3 === 1 ? "bank_transfer" : "cash";
    const price = products[sku].def.price;
    const payments =
      method === "cash"
        ? [{ method: "cash", tendered_amount: price + 10 }]
        : [{ method, amount: price }];
    await sell([{ sku, qty: 1 }], payments, cust.id);
  }
  // Multi-item
  await sell(
    [
      { sku: "PB-20K", qty: 1 },
      { sku: "CBL-USBC", qty: 1 },
      { sku: "KIT-CLN", qty: 1 },
    ],
    [{ method: "card" }],
    retailCustomers[3].id,
  );

  // Refunds
  const refundSaleId = saleIds[0];
  const { data: refundItems } = await owner
    .from("sale_items")
    .select("id, quantity")
    .eq("sale_id", refundSaleId);
  if (refundItems?.[0]) {
    const restock = await rpc(owner, "refund_sale", {
      p_payload: {
        sale_id: refundSaleId,
        reason: "DEMO restock return",
        method: "cash",
        items: [
          {
            sale_item_id: refundItems[0].id,
            quantity: 1,
            restock_disposition: "restock",
          },
        ],
        idempotency_key: crypto.randomUUID(),
      },
    });
    if (restock.error) fail("refund restock", restock.error);
  }

  const damagedSaleId = saleIds[1];
  const { data: dItems } = await owner
    .from("sale_items")
    .select("id")
    .eq("sale_id", damagedSaleId);
  if (dItems?.[0]) {
    const damaged = await rpc(owner, "refund_sale", {
      p_payload: {
        sale_id: damagedSaleId,
        reason: "DEMO damaged non-restock",
        method: "card",
        items: [
          {
            sale_item_id: dItems[0].id,
            quantity: 1,
            restock_disposition: "damaged",
          },
        ],
        idempotency_key: crypto.randomUUID(),
      },
    });
    if (damaged.error) fail("refund damaged", damaged.error);
  }

  // Partial line refund on multi-item sale
  const multiSale = saleIds[saleIds.length - 1];
  const { data: mItems } = await owner.from("sale_items").select("id").eq("sale_id", multiSale);
  if (mItems?.[0]) {
    const partial = await rpc(owner, "refund_sale", {
      p_payload: {
        sale_id: multiSale,
        reason: "DEMO partial line refund",
        method: "cash",
        items: [
          {
            sale_item_id: mItems[0].id,
            quantity: 1,
            restock_disposition: "restock",
          },
        ],
        idempotency_key: crypto.randomUUID(),
      },
    });
    if (partial.error) fail("refund partial", partial.error);
  }
  } else {
    console.log("Sales already seeded — skipping sale creation");
    const { data: existingSales } = await owner
      .from("sales")
      .select("id")
      .eq("shop_id", shopId)
      .ilike("notes", "DEMO%")
      .eq("status", "completed")
      .order("created_at", { ascending: true })
      .limit(20);
    for (const s of existingSales || []) saleIds.push(s.id);

    const { count: refundCount } = await owner
      .from("refunds")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", shopId)
      .ilike("reason", "DEMO%");

    if ((refundCount ?? 0) < 2 && saleIds.length >= 3) {
      const refundSaleId = saleIds[0];
      const { data: refundItems } = await owner
        .from("sale_items")
        .select("id, quantity")
        .eq("sale_id", refundSaleId);
      if (refundItems?.[0]) {
        const restock = await rpc(owner, "refund_sale", {
          p_payload: {
            sale_id: refundSaleId,
            reason: "DEMO restock return",
            method: "cash",
            items: [
              {
                sale_item_id: refundItems[0].id,
                quantity: 1,
                restock_disposition: "restock",
              },
            ],
            idempotency_key: crypto.randomUUID(),
          },
        });
        if (restock.error) fail("refund restock", restock.error);
      }

      const damagedSaleId = saleIds[1];
      const { data: dItems } = await owner
        .from("sale_items")
        .select("id")
        .eq("sale_id", damagedSaleId);
      if (dItems?.[0]) {
        const damaged = await rpc(owner, "refund_sale", {
          p_payload: {
            sale_id: damagedSaleId,
            reason: "DEMO damaged non-restock",
            method: "card",
            items: [
              {
                sale_item_id: dItems[0].id,
                quantity: 1,
                restock_disposition: "damaged",
              },
            ],
            idempotency_key: crypto.randomUUID(),
          },
        });
        if (damaged.error) fail("refund damaged", damaged.error);
      }

      const multiSale = saleIds[saleIds.length - 1];
      const { data: mItems } = await owner
        .from("sale_items")
        .select("id")
        .eq("sale_id", multiSale);
      if (mItems?.[0]) {
        const partial = await rpc(owner, "refund_sale", {
          p_payload: {
            sale_id: multiSale,
            reason: "DEMO partial line refund",
            method: "cash",
            items: [
              {
                sale_item_id: mItems[0].id,
                quantity: 1,
                restock_disposition: "restock",
              },
            ],
            idempotency_key: crypto.randomUUID(),
          },
        });
        if (partial.error) fail("refund partial", partial.error);
      }
    } else {
      console.log("Refunds already seeded — skipping");
    }
  }

  // ---------- Repairs ----------
  console.log("Demo seed: repair jobs…");
  const { count: repairCountNow } = await owner
    .from("repair_jobs")
    .select("id", { count: "exact", head: true })
    .eq("shop_id", shopId);
  if ((repairCountNow ?? 0) >= 10) {
    console.log("Repairs already seeded — skipping repair section");
  } else {
  const { data: intakeDefs } = await owner
    .from("intake_check_definitions")
    .select("id, code")
    .order("sort_order")
    .limit(6);

  const issues = [
    "Cracked display",
    "Battery drains quickly",
    "Intermittent charging connection",
    "No audio from earpiece",
    "Rear camera unable to focus",
    "Liquid damage / no power",
    "Boot loop after software update",
    "Touchscreen intermittently unresponsive",
  ];

  async function createJob(customer, device, issue, extras = {}) {
    const payload = {
      shop_id: shopId,
      customer_id: customer.id,
      device_id: device.id,
      reported_issue: issue,
      device_condition: "Light scuffs; powered on at intake",
      priority: extras.priority || "normal",
      accessories: [
        { accessory_type: "sim", present: true },
        { accessory_type: "case", present: false },
        { accessory_type: "charger", present: extras.withCharger || false },
      ],
      intake_checks: (intakeDefs || []).map((d, idx) => ({
        check_definition_id: d.id,
        result: idx % 3 === 0 ? "not_working" : "working",
        notes: "Intake checklist",
      })),
    };
    if (techUserId) payload.assigned_technician_id = techUserId;
    if (extras.estimated_completion_date) {
      payload.estimated_completion_date = extras.estimated_completion_date;
    }
    const job = await rpc(owner, "create_repair_job", { p_payload: payload });
    if (job.error) fail("create_repair_job", job.error);
    return job.data;
  }

  async function advance(jobId, statuses) {
    for (const status of statuses) {
      const moved = await rpc(owner, "change_repair_status", {
        p_repair_job_id: jobId,
        p_new_status: status,
        p_note: "Status updated",
      });
      if (moved.error) fail(`change_repair_status ${status}`, moved.error);
    }
  }

  async function makeEstimate(jobId, laborName, partSku, qty = 1) {
    const estimate = await rpc(owner, "create_repair_estimate", {
      p_payload: {
        repair_job_id: jobId,
        notes: "Repair estimate",
        items: [
          {
            line_type: "labor",
            repair_service_id: services[laborName].id,
            quantity: 1,
          },
          {
            line_type: "part",
            product_id: products[partSku].id,
            quantity: qty,
          },
        ],
      },
    });
    if (estimate.error) fail("create_repair_estimate", estimate.error);
    return estimate.data;
  }

  async function markPhotoSet(jobId, marker) {
    const details = await rpc(owner, "update_repair_job_details", {
      p_repair_job_id: jobId,
      p_payload: { internal_notes: marker },
    });
    if (details.error) fail("update_repair_job_details photo marker", details.error);
  }

  const repairCustomers = customers.filter((c) => c.devices?.length);
  const jobs = {};

  // 1 received
  jobs.received = await createJob(
    repairCustomers[0],
    repairCustomers[0].devices[0],
    issues[0],
  );
  await markPhotoSet(jobs.received, PHOTO_SET_MARKERS.cracked);

  // 2 diagnosing
  jobs.diagnosing = await createJob(
    repairCustomers[1],
    repairCustomers[1].devices[0],
    issues[1],
  );
  await advance(jobs.diagnosing, ["diagnosing"]);
  const details = await rpc(owner, "update_repair_job_details", {
    p_repair_job_id: jobs.diagnosing,
    p_payload: {
      diagnosis: "Battery health 72%, swollen cell suspected",
      technician_notes: "Quote battery replacement + labor",
    },
  });
  if (details.error) fail("update_repair_job_details", details.error);

  // 3 waiting_for_customer_approval + sent estimate
  jobs.waiting = await createJob(
    repairCustomers[2],
    repairCustomers[2].devices[0],
    issues[2],
  );
  await advance(jobs.waiting, ["diagnosing", "waiting_for_customer_approval"]);
  const estSent = await makeEstimate(jobs.waiting, "Charging port repair", "CHG-IP");
  await rpc(owner, "send_repair_estimate", { p_estimate_id: estSent });
  await markPhotoSet(jobs.waiting, PHOTO_SET_MARKERS.charging);

  // 4 draft estimate only
  jobs.draftEst = await createJob(
    repairCustomers[3],
    repairCustomers[3].devices[0],
    issues[3],
  );
  await advance(jobs.draftEst, ["diagnosing"]);
  await makeEstimate(jobs.draftEst, "Speaker repair", "SPK-IP");

  // 5 rejected estimate
  jobs.rejected = await createJob(
    repairCustomers[4],
    repairCustomers[4].devices[0],
    issues[4],
  );
  await advance(jobs.rejected, ["diagnosing"]);
  const estReject = await makeEstimate(jobs.rejected, "Camera replacement", "CAM-IP14");
  await rpc(owner, "send_repair_estimate", { p_estimate_id: estReject });
  const rejected = await rpc(owner, "reject_repair_estimate", {
    p_estimate_id: estReject,
    p_reason: "Customer declined price",
  });
  if (rejected.error) fail("reject_repair_estimate", rejected.error);

  // 6 approved / waiting_for_parts (via approved)
  jobs.waitingParts = await createJob(
    repairCustomers[5],
    repairCustomers[5].devices[0],
    issues[5],
    { priority: "high" },
  );
  await advance(jobs.waitingParts, ["diagnosing"]);
  const estParts = await makeEstimate(jobs.waitingParts, "Screen replacement", "SCR-IP14");
  await rpc(owner, "send_repair_estimate", { p_estimate_id: estParts });
  await rpc(owner, "approve_repair_estimate", {
    p_estimate_id: estParts,
    p_method: "phone",
  });
  // approve_repair_estimate already moves the job to approved
  await advance(jobs.waitingParts, ["waiting_for_parts"]);
  await markPhotoSet(jobs.waitingParts, PHOTO_SET_MARKERS.liquid);

  // 7 in_repair with parts consumed
  jobs.inRepair = await createJob(
    repairCustomers[6],
    repairCustomers[6].devices[0],
    issues[6],
  );
  await advance(jobs.inRepair, ["diagnosing"]);
  const estIn = await makeEstimate(jobs.inRepair, "Battery replacement", "BAT-IP13");
  await rpc(owner, "approve_repair_estimate", {
    p_estimate_id: estIn,
    p_method: "in_person",
  });
  await advance(jobs.inRepair, ["in_repair"]);
  const consumeIn = await rpc(owner, "consume_repair_parts", {
    p_payload: {
      repair_job_id: jobs.inRepair,
      items: [{ product_id: products["BAT-IP13"].id, quantity: 1 }],
    },
  });
  if (consumeIn.error) fail("consume_repair_parts in_repair", consumeIn.error);

  // 8 testing (before/after photo set)
  jobs.testing = await createJob(
    repairCustomers[7],
    repairCustomers[7].devices[0],
    issues[7],
  );
  await advance(jobs.testing, ["diagnosing"]);
  const estTest = await makeEstimate(jobs.testing, "Screen replacement", "SCR-S23");
  await rpc(owner, "approve_repair_estimate", {
    p_estimate_id: estTest,
    p_method: "in_person",
  });
  await advance(jobs.testing, ["in_repair"]);
  await rpc(owner, "consume_repair_parts", {
    p_payload: {
      repair_job_id: jobs.testing,
      items: [{ product_id: products["SCR-S23"].id, quantity: 1 }],
    },
  });
  await advance(jobs.testing, ["testing"]);
  await markPhotoSet(jobs.testing, PHOTO_SET_MARKERS.before_after);

  // 9 ready_for_pickup (notification)
  jobs.ready = await createJob(
    repairCustomers[0],
    repairCustomers[0].devices[0],
    "Cracked display (return visit)",
  );
  await advance(jobs.ready, ["diagnosing"]);
  const estReady = await makeEstimate(jobs.ready, "Screen replacement", "SCR-IP14");
  await rpc(owner, "approve_repair_estimate", {
    p_estimate_id: estReady,
    p_method: "in_person",
  });
  await advance(jobs.ready, ["in_repair"]);
  await rpc(owner, "consume_repair_parts", {
    p_payload: {
      repair_job_id: jobs.ready,
      items: [{ product_id: products["SCR-IP14"].id, quantity: 1 }],
    },
  });
  await advance(jobs.ready, ["testing", "ready_for_pickup"]);

  // 10 completed with warranty + full payment
  jobs.completed = await createJob(
    repairCustomers[1],
    repairCustomers[1].devices[0],
    issues[1],
  );
  await advance(jobs.completed, ["diagnosing"]);
  const estDone = await makeEstimate(jobs.completed, "Battery replacement", "BAT-S23");
  await rpc(owner, "approve_repair_estimate", {
    p_estimate_id: estDone,
    p_method: "in_person",
  });
  await advance(jobs.completed, ["in_repair"]);
  await rpc(owner, "consume_repair_parts", {
    p_payload: {
      repair_job_id: jobs.completed,
      items: [{ product_id: products["BAT-S23"].id, quantity: 1 }],
    },
  });
  const { data: doneRow } = await owner
    .from("repair_jobs")
    .select("total")
    .eq("id", jobs.completed)
    .single();
  const doneTotal = Number(doneRow?.total || 0);
  if (doneTotal > 0) {
    const pay = await rpc(owner, "record_payment", {
      p_payload: {
        reference_type: "repair",
        reference_id: jobs.completed,
        method: "cash",
        amount: doneTotal,
        tendered_amount: doneTotal + 20,
        idempotency_key: crypto.randomUUID(),
      },
    });
    if (pay.error) fail("record_payment completed", pay.error);
  }
  await advance(jobs.completed, ["testing", "ready_for_pickup", "completed"]);

  // 11 delivered
  jobs.delivered = await createJob(
    repairCustomers[2],
    repairCustomers[2].devices[0],
    "Touchscreen intermittently unresponsive",
  );
  await advance(jobs.delivered, ["diagnosing"]);
  const estDel = await makeEstimate(jobs.delivered, "Speaker repair", "SPK-AND");
  await rpc(owner, "approve_repair_estimate", {
    p_estimate_id: estDel,
    p_method: "in_person",
  });
  await advance(jobs.delivered, ["in_repair"]);
  await rpc(owner, "consume_repair_parts", {
    p_payload: {
      repair_job_id: jobs.delivered,
      items: [{ product_id: products["SPK-AND"].id, quantity: 1 }],
    },
  });
  const { data: delRow } = await owner
    .from("repair_jobs")
    .select("total")
    .eq("id", jobs.delivered)
    .single();
  const delTotal = Number(delRow?.total || 0);
  if (delTotal > 0) {
    await rpc(owner, "record_payment", {
      p_payload: {
        reference_type: "repair",
        reference_id: jobs.delivered,
        method: "card",
        amount: delTotal,
        idempotency_key: crypto.randomUUID(),
      },
    });
  }
  await advance(jobs.delivered, ["testing", "ready_for_pickup", "completed", "delivered"]);

  // 12 partial payment / deposit still in repair
  jobs.deposit = await createJob(
    repairCustomers[3],
    repairCustomers[3].devices[0],
    "Intermittent charging connection",
  );
  await advance(jobs.deposit, ["diagnosing"]);
  const estDep = await makeEstimate(jobs.deposit, "Charging port repair", "CHG-USB");
  await rpc(owner, "approve_repair_estimate", {
    p_estimate_id: estDep,
    p_method: "in_person",
  });
  const { data: depRow } = await owner
    .from("repair_jobs")
    .select("total")
    .eq("id", jobs.deposit)
    .single();
  const depTotal = Number(depRow?.total || 0);
  if (depTotal > 10) {
    await rpc(owner, "record_payment", {
      p_payload: {
        reference_type: "repair",
        reference_id: jobs.deposit,
        method: "cash",
        amount: Math.min(Math.floor(depTotal / 2), Math.floor(depTotal * 0.4)),
        idempotency_key: crypto.randomUUID(),
      },
    });
  }
  await advance(jobs.deposit, ["waiting_for_parts"]);

  // 13 unpaid approved (stop at approved)
  jobs.unpaid = await createJob(
    repairCustomers[4],
    repairCustomers[4].devices?.[1] || repairCustomers[4].devices[0],
    "Rear camera unable to focus",
  );
  await advance(jobs.unpaid, ["diagnosing"]);
  const estUnpaid = await makeEstimate(jobs.unpaid, "Camera replacement", "CAM-PXL8");
  await rpc(owner, "approve_repair_estimate", {
    p_estimate_id: estUnpaid,
    p_method: "email",
  });
  // Job remains at approved (set by approve_repair_estimate)
  await markPhotoSet(jobs.unpaid, PHOTO_SET_MARKERS.camera);

  // 14 superseded estimate (approve then revise)
  jobs.revised = await createJob(
    repairCustomers[5],
    repairCustomers[5].devices?.[1] || repairCustomers[5].devices[0],
    "Boot loop after software update",
  );
  await advance(jobs.revised, ["diagnosing"]);
  const estV1 = await makeEstimate(jobs.revised, "Software troubleshooting", "KIT-OPEN");
  await rpc(owner, "approve_repair_estimate", {
    p_estimate_id: estV1,
    p_method: "in_person",
  });
  const revised = await rpc(owner, "revise_repair_estimate", { p_estimate_id: estV1 });
  if (revised.error) fail("revise_repair_estimate", revised.error);

  // 15 cancel after consume → repair_return
  jobs.cancelledReturn = await createJob(
    repairCustomers[6],
    repairCustomers[6].devices[0],
    "Liquid damage / no power",
  );
  await advance(jobs.cancelledReturn, ["diagnosing"]);
  const estCancel = await makeEstimate(
    jobs.cancelledReturn,
    "Water-damage inspection",
    "KIT-CLN",
  );
  await rpc(owner, "approve_repair_estimate", {
    p_estimate_id: estCancel,
    p_method: "in_person",
  });
  await advance(jobs.cancelledReturn, ["in_repair"]);
  await rpc(owner, "consume_repair_parts", {
    p_payload: {
      repair_job_id: jobs.cancelledReturn,
      items: [{ product_id: products["KIT-CLN"].id, quantity: 1 }],
    },
  });
  const cancelled = await rpc(owner, "cancel_repair", {
    p_repair_job_id: jobs.cancelledReturn,
    p_reason: "Customer cancelled; parts returned to stock",
  });
  if (cancelled.error) fail("cancel_repair return", cancelled.error);

  // Warranty claim from completed job
  const { data: warranty } = await owner
    .from("warranties")
    .select("id")
    .eq("repair_job_id", jobs.completed)
    .maybeSingle();
  if (warranty?.id) {
    const claim = await rpc(owner, "create_warranty_claim", {
      p_payload: {
        warranty_id: warranty.id,
        description: "Battery swelling returned within warranty window",
      },
    });
    if (claim.error) fail("create_warranty_claim", claim.error);
  }
  } // end repairs section

  // ---------- Expenses ----------
  console.log("Demo seed: expenses…");
  const { count: expenseCount } = await owner
    .from("expenses")
    .select("id", { count: "exact", head: true })
    .eq("shop_id", shopId)
    .ilike("description", "%DEMO%");
  if ((expenseCount ?? 0) >= 5) {
    console.log("Expenses already seeded — skipping");
  } else {
  const { data: expenseCats } = await owner.from("expense_categories").select("id, name");
  const catByName = Object.fromEntries((expenseCats || []).map((c) => [c.name, c.id]));
  // Add Marketing / Maintenance if missing
  for (const name of ["Marketing", "Maintenance", "Shop supplies"]) {
    if (!catByName[name]) {
      const { data } = await owner
        .from("expense_categories")
        .insert({ name })
        .select("id, name")
        .single();
      if (data) catByName[name] = data.id;
    }
  }
  const today = new Date();
  const expenseRows = [
    ["Rent", 185000, "Monthly shop rent DEMO"],
    ["Electricity", 28000, "Utilities DEMO"],
    ["Internet", 8500, "Fiber DEMO"],
    ["Transport", 6500, "Parts courier DEMO"],
    ["Marketing", 12000, "Local flyer DEMO"],
    ["Maintenance", 15000, "AC service DEMO"],
    ["Shop supplies", 4500, "Cleaning supplies DEMO"],
    ["Tools", 18500, "Precision bits DEMO"],
  ];
  for (let i = 0; i < expenseRows.length; i += 1) {
    const [name, amount, description] = expenseRows[i];
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const expenseDate = d.toISOString().slice(0, 10);
    await owner.from("expenses").insert({
      organization_id: orgId,
      shop_id: shopId,
      category_id: catByName[name],
      amount,
      expense_date: expenseDate,
      description,
      payment_method: i % 2 === 0 ? "cash" : "bank_transfer",
      created_by: ownerUser.id,
    });
  }
  } // end expenses

  // ---------- Validation ----------
  console.log("Demo seed: validating…");
  const validation = await validateDemo(owner, orgId, shopId);
  for (const v of validation) {
    console.log(`${v.ok ? "PASS" : "FAIL"}  ${v.name}${v.detail ? ` — ${v.detail}` : ""}`);
  }
  if (validation.some((v) => !v.ok)) {
    throw new Error("Demo seed validation failed");
  }

  await printSummary(owner, orgId, shopId, {
    skipped: false,
    createStaff,
    ownerEmail: OWNER_EMAIL,
    limitation:
      "Sale/repair timestamps are current (complete_sale / change_repair_status do not accept historical dates).",
  });
}

async function validateDemo(sb, orgId, shopId) {
  const results = [];
  const record = (name, ok, detail = "") => results.push({ name, ok, detail });

  const { data: stocks } = await sb
    .from("product_stocks")
    .select("product_id, quantity")
    .eq("shop_id", shopId);
  const neg = (stocks || []).filter((s) => Number(s.quantity) < 0);
  record("no negative stock", neg.length === 0, `neg=${neg.length}`);

  const { data: movements } = await sb
    .from("inventory_movements")
    .select("product_id, quantity_change")
    .eq("shop_id", shopId);
  const ledger = new Map();
  for (const m of movements || []) {
    ledger.set(m.product_id, (ledger.get(m.product_id) || 0) + Number(m.quantity_change));
  }
  let drift = 0;
  for (const s of stocks || []) {
    const fromLedger = ledger.get(s.product_id) || 0;
    if (Math.abs(fromLedger - Number(s.quantity)) > 0.001) drift += 1;
  }
  record("product_stocks agrees with movement ledger", drift === 0, `drift=${drift}`);

  const { data: sales } = await sb.from("sales").select("sale_number").eq("shop_id", shopId);
  const saleNums = (sales || []).map((s) => s.sale_number);
  record(
    "no duplicate sale numbers",
    new Set(saleNums).size === saleNums.length,
    `sales=${saleNums.length}`,
  );

  const { data: repairs } = await sb.from("repair_jobs").select("status").eq("shop_id", shopId);
  const validStatuses = new Set([
    "received",
    "diagnosing",
    "waiting_for_customer_approval",
    "approved",
    "waiting_for_parts",
    "in_repair",
    "testing",
    "ready_for_pickup",
    "completed",
    "delivered",
    "cancelled",
  ]);
  const badStatus = (repairs || []).filter((r) => !validStatuses.has(r.status));
  record("repair statuses valid", badStatus.length === 0);

  // Realism: demo staff/owner profiles should have proper names
  const { data: demoProfiles } = await sb
    .from("profiles")
    .select("id, first_name, last_name")
    .eq("organization_id", orgId);
  const badNames = (demoProfiles || []).filter(
    (p) =>
      !p.first_name ||
      !p.last_name ||
      String(p.first_name).includes("null") ||
      String(p.last_name).includes("null"),
  );
  record(
    "demo profiles have real first/last names",
    badNames.length === 0,
    `bad=${badNames.length}`,
  );

  // Realism: no NaN IMEIs on demo customer devices
  const { data: demoCustomers } = await sb
    .from("customers")
    .select("id")
    .ilike("email", `%@${DEMO_EMAIL_DOMAIN}`);
  const demoCustomerIds = (demoCustomers || []).map((c) => c.id);
  let badImei = 0;
  if (demoCustomerIds.length) {
    const { data: devices } = await sb
      .from("customer_devices")
      .select("imei")
      .in("customer_id", demoCustomerIds);
    badImei = (devices || []).filter(
      (d) => !d.imei || /NaN/i.test(String(d.imei)),
    ).length;
  }
  record("no IMEI containing NaN", badImei === 0, `bad=${badImei}`);

  // Realism: customer-facing repair issues must not say DEMO
  const { data: repairIssues } = await sb
    .from("repair_jobs")
    .select("id, reported_issue, internal_notes")
    .eq("shop_id", shopId);
  const demoIssues = (repairIssues || []).filter((r) =>
    /\bDEMO\b/i.test(r.reported_issue || ""),
  );
  record(
    "no reported_issue contains DEMO",
    demoIssues.length === 0,
    `bad=${demoIssues.length}`,
  );

  // Realism: DEMO products use LKR-scale prices
  const { data: demoProds } = await sb
    .from("products")
    .select("id, sku, selling_price")
    .like("sku", `${SKU_PREFIX}%`);
  const cheap = (demoProds || []).filter((p) => Number(p.selling_price) < 400);
  record(
    "DEMO products selling_price >= 400",
    cheap.length === 0,
    `cheap=${cheap.length}`,
  );

  const prodIds = (demoProds || []).map((p) => p.id);
  let costAboveSell = 0;
  if (prodIds.length) {
    const { data: costs } = await sb
      .from("product_costs")
      .select("product_id, cost_price")
      .in("product_id", prodIds);
    const sellById = Object.fromEntries(
      (demoProds || []).map((p) => [p.id, Number(p.selling_price)]),
    );
    costAboveSell = (costs || []).filter(
      (c) => Number(c.cost_price) >= sellById[c.product_id],
    ).length;
  }
  record(
    "DEMO product cost < selling_price",
    costAboveSell === 0,
    `bad=${costAboveSell}`,
  );

  // Soft check: photo-set markers present when repairs exist (warn only)
  if ((repairIssues || []).length >= 10) {
    const notes = (repairIssues || []).map((r) => r.internal_notes || "").join("\n");
    const missingMarkers = Object.values(PHOTO_SET_MARKERS).filter(
      (m) => !notes.includes(m),
    );
    record(
      "PHOTO_SET markers present",
      missingMarkers.length === 0,
      missingMarkers.length
        ? `missing=${missingMarkers.join(",")}`
        : "all markers found",
    );
  }

  // Cashier cost isolation (if demo cashier exists)
  try {
    const env = loadEnv();
    const password = process.env.DEMO_SEED_PASSWORD || env.DEMO_SEED_PASSWORD;
    const cashierSb = await signIn(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      STAFF_EMAILS.cashier,
      password,
    );
    const costs = await cashierSb.from("product_costs").select("cost_price").limit(5);
    record(
      "cashier cannot read product_costs",
      !costs.data?.length,
      `rows=${costs.data?.length ?? 0}`,
    );
  } catch {
    record("cashier cannot read product_costs", true, "skipped — staff not created");
  }

  return results;
}

async function printSummary(sb, orgId, shopId, meta) {
  const { data: org } = await sb.from("organizations").select("id, name").eq("id", orgId).single();
  const { data: shop } = await sb.from("shops").select("id, name").eq("id", shopId).single();

  const count = async (table, filter) => {
    let q = sb.from(table).select("id", { count: "exact", head: true });
    if (filter) q = filter(q);
    const { count: c } = await q;
    return c ?? 0;
  };

  const customers = await count("customers");
  const devices = await count("customer_devices");
  const products = await count("products", (q) => q.like("sku", `${SKU_PREFIX}%`));
  const suppliers = await count("suppliers");
  const purchases = await count("purchases", (q) => q.eq("shop_id", shopId));
  const sales = await count("sales", (q) => q.eq("shop_id", shopId));
  const refunds = await count("refunds", (q) => q.eq("shop_id", shopId));
  const expenses = await count("expenses", (q) => q.eq("shop_id", shopId));
  const warranties = await count("warranties");
  const claims = await count("warranty_claims");
  const notifications = await count("notifications");
  const estimates = await count("repair_estimates");

  const { data: repairRows } = await sb
    .from("repair_jobs")
    .select("status")
    .eq("shop_id", shopId);
  const byStatus = {};
  for (const r of repairRows || []) {
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
  }

  const { data: stocks } = await sb
    .from("product_stocks")
    .select("quantity, product_id")
    .eq("shop_id", shopId);
  const { data: demoProducts } = await sb
    .from("products")
    .select("id, min_stock, sku")
    .like("sku", `${SKU_PREFIX}%`);
  const minById = Object.fromEntries((demoProducts || []).map((p) => [p.id, Number(p.min_stock)]));
  let inStock = 0;
  let low = 0;
  let out = 0;
  for (const s of stocks || []) {
    if (!(s.product_id in minById)) continue;
    const qty = Number(s.quantity);
    const min = minById[s.product_id] || 0;
    if (qty <= 0) out += 1;
    else if (qty <= min) low += 1;
    else inStock += 1;
  }

  console.log("\n========== DEMO SEED SUMMARY ==========");
  console.log(`skipped: ${meta.skipped ? "yes" : "no"}`);
  console.log(`organization: ${org?.name} (${orgId})`);
  console.log(`shop: ${shop?.name} (${shopId})`);
  console.log(`customers: ${customers}`);
  console.log(`customer_devices: ${devices}`);
  console.log(`DEMO products: ${products}`);
  console.log(`suppliers: ${suppliers}`);
  console.log(`purchases: ${purchases}`);
  console.log(`inventory: in_stock=${inStock} low=${low} out=${out}`);
  console.log(`repair_jobs by status: ${JSON.stringify(byStatus)}`);
  console.log(`estimates: ${estimates}`);
  console.log(`sales: ${sales}`);
  console.log(`refunds: ${refunds}`);
  console.log(`expenses: ${expenses}`);
  console.log(`warranties: ${warranties} claims: ${claims}`);
  console.log(`notifications: ${notifications}`);
  if (meta.ownerEmail) {
    console.log(`demo owner email: ${meta.ownerEmail}`);
    console.log(`demo staff created: ${meta.createStaff ? "yes" : "no"}`);
    console.log("password: (from DEMO_SEED_PASSWORD — not printed)");
  }
  if (meta.limitation) console.log(`limitation: ${meta.limitation}`);
  console.log("=======================================\n");
}

main().catch((err) => {
  console.error("FATAL:", err.message || err);
  process.exit(1);
});

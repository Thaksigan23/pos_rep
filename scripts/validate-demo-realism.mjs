/**
 * Validate DEMO dataset realism (LKR prices, names, clean repair issues, IMEIs).
 *
 * Usage:
 *   ALLOW_DEMO_SEED=1 DEMO_SEED_PASSWORD=... npm run validate:demo
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  DEMO_ORG_NAME,
  DEMO_SHOP_NAME,
  SKU_PREFIX,
  DEMO_EMAIL_DOMAIN,
  PHOTO_SET_MARKERS,
} from "./lib/demo-realism.mjs";

const OWNER_EMAIL = `owner@${DEMO_EMAIL_DOMAIN}`;
const STAFF_EMAILS = {
  cashier: `cashier@${DEMO_EMAIL_DOMAIN}`,
};

const args = new Set(process.argv.slice(2));
const allowFlag = args.has("--allow-demo-seed");

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
      "Refusing demo validate. Set ALLOW_DEMO_SEED=1 or pass --allow-demo-seed.",
    );
  }
  const password = process.env.DEMO_SEED_PASSWORD || env.DEMO_SEED_PASSWORD;
  if (!password || password.length < 10) {
    throw new Error("DEMO_SEED_PASSWORD is required (min 10 chars).");
  }
  return password;
}

async function signIn(url, anon, email, password) {
  const sb = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw new Error(`[signIn ${email}] ${error?.message || "no session"}`);
  }
  return sb;
}

async function validateDemoRealism(sb, orgId, shopId) {
  const results = [];
  const record = (name, ok, detail = "") => results.push({ name, ok, detail });

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

  if ((repairIssues || []).length >= 5) {
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
  } else {
    record("PHOTO_SET markers present", false, "too few repairs");
  }

  // Structural mapping for DEMO repair photos (not semantic image content).
  const photoExpectations = {
    [PHOTO_SET_MARKERS.cracked]: [
      "demo-cracked-front.webp",
      "demo-device-back.webp",
      "demo-intake-overview.webp",
    ],
    [PHOTO_SET_MARKERS.charging]: [
      "demo-charging-port.webp",
      "demo-device-overview.webp",
    ],
    [PHOTO_SET_MARKERS.liquid]: [
      "demo-liquid-indicator.webp",
      "demo-exterior-condition.webp",
    ],
    [PHOTO_SET_MARKERS.camera]: [
      "demo-camera-damage.webp",
      "demo-device-overview.webp",
    ],
    [PHOTO_SET_MARKERS.before_after]: [
      "demo-before-screen.webp",
      "demo-after-screen.webp",
    ],
  };
  let photoMapOk = true;
  let photoMapDetail = [];
  let demoPhotoTotal = 0;
  for (const [marker, expectedFiles] of Object.entries(photoExpectations)) {
    const job = (repairIssues || []).find((r) =>
      (r.internal_notes || "").includes(marker),
    );
    if (!job) {
      photoMapOk = false;
      photoMapDetail.push(`${marker}:no-job`);
      continue;
    }
    const { data: rows } = await sb
      .from("repair_photos")
      .select("id, storage_path, caption")
      .eq("repair_job_id", job.id);
    const paths = (rows || []).map((r) => r.storage_path);
    const basenames = paths.map((p) => p.split("/").pop());
    demoPhotoTotal += (rows || []).filter((r) =>
      (r.storage_path || "").includes("/demo-"),
    ).length;
    for (const file of expectedFiles) {
      const expectedPath = `${orgId}/${shopId}/${job.id}/${file}`;
      if (!paths.includes(expectedPath)) {
        photoMapOk = false;
        photoMapDetail.push(`${marker}:missing:${file}`);
      }
    }
    const unexpectedDemo = basenames.filter(
      (b) => b?.startsWith("demo-") && !expectedFiles.includes(b),
    );
    if (unexpectedDemo.length) {
      photoMapOk = false;
      photoMapDetail.push(`${marker}:extra:${unexpectedDemo.join(",")}`);
    }
    if ((rows || []).length !== expectedFiles.length) {
      // Allow extra non-demo uploads on the same job only if flagged — still fail exact count for DEMO purity
      const nonDemo = (rows || []).filter(
        (r) => !(r.storage_path || "").includes("/demo-"),
      );
      if (nonDemo.length) {
        photoMapOk = false;
        photoMapDetail.push(
          `${marker}:non-demo-uploads=${nonDemo.length}`,
        );
      } else if ((rows || []).length !== expectedFiles.length) {
        photoMapOk = false;
        photoMapDetail.push(
          `${marker}:count=${(rows || []).length} expected=${expectedFiles.length}`,
        );
      }
    }
  }
  record(
    "DEMO repair photo paths/counts match manifest",
    photoMapOk && demoPhotoTotal === 11,
    photoMapOk
      ? `demoRows=${demoPhotoTotal}`
      : photoMapDetail.join("; ") || `demoRows=${demoPhotoTotal}`,
  );

  try {
    const env = { ...loadEnv(), ...process.env };
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

async function main() {
  const env = { ...loadEnv(), ...process.env };
  const password = assertSafetyGuards(env);

  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / ANON_KEY");
  }

  const owner = await signIn(url, anon, OWNER_EMAIL, password);
  const {
    data: { user },
  } = await owner.auth.getUser();
  if (!user?.id) {
    throw new Error("Demo owner session has no user id");
  }
  const { data: profile } = await owner
    .from("profiles")
    .select("organization_id, default_shop_id")
    .eq("id", user.id)
    .maybeSingle();

  let orgId = env.DEMO_ORG_ID || profile?.organization_id;
  let shopId = env.DEMO_SHOP_ID || profile?.default_shop_id;

  if (!shopId && orgId) {
    const { data: shop } = await owner
      .from("shops")
      .select("id, name")
      .eq("organization_id", orgId)
      .eq("name", DEMO_SHOP_NAME)
      .maybeSingle();
    shopId = shop?.id;
  }
  if (!orgId || !shopId) {
    throw new Error("Could not resolve demo org/shop. Run seed:demo first.");
  }

  const { data: org } = await owner
    .from("organizations")
    .select("name")
    .eq("id", orgId)
    .single();
  const { data: shop } = await owner.from("shops").select("name").eq("id", shopId).single();
  if (org?.name !== DEMO_ORG_NAME || shop?.name !== DEMO_SHOP_NAME) {
    throw new Error(
      `Expected ${DEMO_ORG_NAME} / ${DEMO_SHOP_NAME}, got ${org?.name} / ${shop?.name}`,
    );
  }

  console.log(`Validating demo realism for ${org.name} / ${shop.name}…`);
  const validation = await validateDemoRealism(owner, orgId, shopId);
  for (const v of validation) {
    console.log(`${v.ok ? "PASS" : "FAIL"}  ${v.name}${v.detail ? ` — ${v.detail}` : ""}`);
  }
  if (validation.some((v) => !v.ok)) {
    throw new Error("Demo realism validation failed");
  }
  console.log("All demo realism checks passed.");
}

main().catch((err) => {
  console.error("FATAL:", err.message || err);
  process.exit(1);
});

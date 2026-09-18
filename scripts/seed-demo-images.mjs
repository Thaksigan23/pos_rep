/**
 * Demo image seed for MobilePOS — product images, shop logo, repair photos.
 *
 * Safety:
 * - Requires ALLOW_DEMO_SEED=1 or --allow-demo-seed
 * - Refuses production-like env unless ALLOW_DEMO_SEED_IN_PRODUCTION=1
 * - Only targets Demo Mobile Solutions / Demo Mobile Repair (or explicit DEMO_ORG_ID + DEMO_SHOP_ID)
 * - Does NOT create sales/payments/refunds or alter inventory/repairs/estimates
 * - Idempotent: deterministic storage paths; re-run reuses existing objects/rows
 *
 * Usage:
 *   ALLOW_DEMO_SEED=1 npm run seed:demo:images
 */
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { spawnSync } from "node:child_process";

const DEMO_ORG_NAME = "Demo Mobile Solutions";
const DEMO_SHOP_NAME = "Demo Mobile Repair";
const SKU_PREFIX = "DEMO-";
const DEMO_EMAIL_DOMAIN = "demo.mobilepos.local";
const OWNER_EMAIL = `owner@${DEMO_EMAIL_DOMAIN}`;

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(__dirname, "demo-assets");

const args = new Set(process.argv.slice(2));
const allowFlag = args.has("--allow-demo-seed");

/** Deterministic realistic WebP fixtures (see demo-assets/products/manifest.json). */
const PRODUCT_ASSET_BY_SKU = {
  "SCR-IP13": "oled-screen-assembly.webp",
  "SCR-IP14": "oled-screen-assembly.webp",
  "SCR-IP15": "oled-screen-assembly.webp",
  "SCR-S23": "oled-screen-assembly.webp",
  "SCR-PXL7": "oled-screen-assembly.webp",
  "SCR-A54": "oled-screen-assembly.webp",
  "BAT-IP13": "phone-battery.webp",
  "BAT-IP15": "phone-battery.webp",
  "BAT-S23": "phone-battery.webp",
  "BAT-PXL": "phone-battery.webp",
  "CHG-IP": "lightning-charging-flex.webp",
  "CHG-USB": "usbc-charging-flex.webp",
  "CAM-IP14": "rear-camera-module.webp",
  "CAM-PXL8": "rear-camera-module.webp",
  "SPK-IP": "phone-speaker.webp",
  "SPK-AND": "phone-speaker.webp",
  "CBL-USBC": "usbc-cable.webp",
  "CBL-USBC-3": "usbc-cable.webp",
  "CBL-LTN": "lightning-cable.webp",
  "CHG-20W": "wall-charger.webp",
  "CHG-30W": "wall-charger.webp",
  "CSE-IP14": "clear-phone-case.webp",
  "CSE-S23": "rugged-phone-case.webp",
  "CSE-PXL": "soft-phone-case.webp",
  "GLS-IP15": "tempered-glass.webp",
  "GLS-UNI": "tempered-glass.webp",
  "PB-10K": "power-bank.webp",
  "PB-20K": "power-bank.webp",
  "KIT-CLN": "cleaning-kit.webp",
  "TOL-SIM": "sim-eject-tool.webp",
  "KIT-OPEN": "opening-tool-kit.webp",
  "MIC-IP": "microphone-flex.webp",
};

const DEMO_PRIMARY_WEBP = "demo-primary.webp";
const DEMO_PRIMARY_SVG_LEGACY = "demo-primary.svg";

/** Five DEMO repairs × realistic WebP fixtures (by internal_notes PHOTO_SET marker). */
function loadRepairPhotoSets() {
  const manifestPath = join(ASSETS, "repairs", "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error("Missing scripts/demo-assets/repairs/manifest.json");
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  return (manifest.scenarios || []).map((scenario) => ({
    id: scenario.id,
    marker: scenario.marker,
    photos: (scenario.photos || []).map((photo) => ({
      file: photo.file,
      legacy: photo.file.replace(/\.webp$/i, ".png"),
      caption: photo.caption,
    })),
  }));
}

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
      "Refusing demo image seed. Set ALLOW_DEMO_SEED=1 or pass --allow-demo-seed.",
    );
  }

  const nodeEnv = process.env.NODE_ENV || env.NODE_ENV || "";
  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ||
    env.NEXT_PUBLIC_APP_URL ||
    ""
  ).toLowerCase();
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
        "Refusing demo image seed against a production-like environment. Set ALLOW_DEMO_SEED_IN_PRODUCTION=1 only if intentional.",
      );
    }
  }
}

function ensureAssets() {
  const probe = join(ASSETS, "products", "oled-screen-assembly.webp");
  const productManifest = join(ASSETS, "products", "manifest.json");
  if (!existsSync(probe) || !existsSync(productManifest)) {
    throw new Error(
      "Missing realistic demo product WebP fixtures (scripts/demo-assets/products/*.webp + manifest.json). Generate/optimize assets before seeding.",
    );
  }
  for (const file of Object.values(PRODUCT_ASSET_BY_SKU)) {
    const p = join(ASSETS, "products", file);
    if (!existsSync(p)) {
      throw new Error(`Missing demo product asset: ${file}`);
    }
  }
  const repairSets = loadRepairPhotoSets();
  for (const set of repairSets) {
    if (!set.marker) {
      throw new Error(`Repair scenario ${set.id} missing DEMO_PHOTO_SET marker`);
    }
    for (const photo of set.photos) {
      const p = join(ASSETS, "repairs", photo.file);
      if (!existsSync(p)) {
        throw new Error(`Missing demo repair asset: ${photo.file}`);
      }
    }
  }
  const logo = join(ASSETS, "shop", "logo.svg");
  if (!existsSync(logo)) {
    console.log("Generating missing shop SVG fixtures…");
    const r = spawnSync(process.execPath, [join(__dirname, "generate-demo-assets.mjs")], {
      stdio: "inherit",
    });
    if (r.status !== 0) throw new Error("Failed to generate demo-assets");
  }
}

function fail(step, error) {
  throw new Error(`[${step}] ${error?.message || String(error)}`);
}

async function signIn(url, anon, email, password) {
  const sb = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.session) fail(`signIn ${email}`, error || new Error("no session"));
  return sb;
}

async function resolveDemoTargets(owner, env) {
  let orgId = process.env.DEMO_ORG_ID || env.DEMO_ORG_ID || null;
  let shopId = process.env.DEMO_SHOP_ID || env.DEMO_SHOP_ID || null;

  if (orgId || shopId) {
    if (!orgId || !shopId) {
      throw new Error("Provide both DEMO_ORG_ID and DEMO_SHOP_ID, or neither.");
    }
    const { data: profile } = await owner.from("profiles").select("organization_id").single();
    if (profile?.organization_id !== orgId) {
      throw new Error("Signed-in demo owner does not belong to DEMO_ORG_ID. Do not guess UUIDs.");
    }
    const { data: shop } = await owner
      .from("shops")
      .select("id, name, organization_id")
      .eq("id", shopId)
      .maybeSingle();
    if (!shop || shop.organization_id !== orgId) {
      throw new Error("DEMO_SHOP_ID does not belong to DEMO_ORG_ID.");
    }
    return { orgId, shopId, shopName: shop.name };
  }

  const { data: org } = await owner
    .from("organizations")
    .select("id, name")
    .eq("name", DEMO_ORG_NAME)
    .maybeSingle();
  if (!org) {
    throw new Error(
      `Demo org "${DEMO_ORG_NAME}" not found. Run npm run seed:demo first, or set DEMO_ORG_ID + DEMO_SHOP_ID.`,
    );
  }
  const { data: shop } = await owner
    .from("shops")
    .select("id, name")
    .eq("organization_id", org.id)
    .eq("name", DEMO_SHOP_NAME)
    .maybeSingle();
  if (!shop) {
    throw new Error(`Demo shop "${DEMO_SHOP_NAME}" not found under demo org.`);
  }
  return { orgId: org.id, shopId: shop.id, shopName: shop.name };
}

async function ensureStorageObject(sb, bucket, objectPath, localPath, contentType) {
  const bytes = readFileSync(localPath);
  const { data: listed } = await sb.storage.from(bucket).list(
    objectPath.split("/").slice(0, -1).join("/"),
    { search: objectPath.split("/").pop() },
  );
  const exists = (listed || []).some((o) => o.name === objectPath.split("/").pop());
  if (exists) {
    return { uploaded: false, path: objectPath };
  }
  const { error } = await sb.storage.from(bucket).upload(objectPath, bytes, {
    contentType,
    upsert: false,
  });
  if (error) {
    // Concurrent/idempotent race: treat already-exists as reuse
    if (/already exists|duplicate|resource already/i.test(error.message)) {
      return { uploaded: false, path: objectPath };
    }
    fail(`upload ${bucket}/${objectPath}`, error);
  }
  return { uploaded: true, path: objectPath };
}

async function seedShopLogo(owner, orgId, shopId) {
  const local = join(ASSETS, "shop", "logo.svg");
  const objectPath = `${orgId}/${shopId}/branding/logo.svg`;
  const { data: settings } = await owner
    .from("shop_settings")
    .select("logo_path")
    .eq("shop_id", shopId)
    .maybeSingle();

  // Never overwrite a different existing logo (non-demo or alternate path).
  if (settings?.logo_path && settings.logo_path !== objectPath) {
    console.log(`Skipping shop logo — existing logo_path: ${settings.logo_path}`);
    return { skipped: true };
  }

  const up = await ensureStorageObject(
    owner,
    "shop-assets",
    objectPath,
    local,
    "image/svg+xml",
  );

  if (settings?.logo_path === objectPath) {
    console.log(`Shop logo already set (${up.uploaded ? "re-uploaded" : "reused"})`);
    return { skipped: false, reused: !up.uploaded };
  }

  const { error } = await owner.rpc("set_shop_logo_path", {
    p_shop_id: shopId,
    p_logo_path: objectPath,
  });
  if (error) fail("set_shop_logo_path", error);
  console.log(`Shop logo ${up.uploaded ? "uploaded" : "reused"} and linked`);
  return { skipped: false, uploaded: up.uploaded };
}

async function ensureStorageObjectUpsert(sb, bucket, objectPath, localPath, contentType) {
  const bytes = readFileSync(localPath);
  const { error } = await sb.storage.from(bucket).upload(objectPath, bytes, {
    contentType,
    upsert: true,
  });
  if (error) fail(`upload upsert ${bucket}/${objectPath}`, error);
  return { uploaded: true, path: objectPath };
}

async function removeStorageObjectQuiet(sb, bucket, objectPath) {
  const { error } = await sb.storage.from(bucket).remove([objectPath]);
  if (error && !/not found|404/i.test(error.message || "")) {
    console.warn(`Could not remove ${bucket}/${objectPath}: ${error.message}`);
  }
}

async function seedProductImages(owner, orgId, shopId) {
  const { data: products, error } = await owner
    .from("products")
    .select("id, sku, name")
    .like("sku", `${SKU_PREFIX}%`)
    .order("sku");
  if (error) fail("list products", error);
  if (!products?.length) {
    throw new Error("No DEMO-* products found. Run npm run seed:demo first.");
  }

  let created = 0;
  let reused = 0;
  let replaced = 0;
  let uploaded = 0;

  for (const product of products) {
    const shortSku = product.sku.replace(SKU_PREFIX, "");
    const assetName = PRODUCT_ASSET_BY_SKU[shortSku];
    if (!assetName) {
      console.warn(`No manifest asset for ${product.sku} — skip`);
      continue;
    }
    const local = join(ASSETS, "products", assetName);
    if (!existsSync(local)) fail(`missing asset ${assetName}`, new Error("file not found"));

    const objectPath = `${orgId}/${shopId}/products/${product.id}/${DEMO_PRIMARY_WEBP}`;
    const legacySvgPath = `${orgId}/${shopId}/products/${product.id}/${DEMO_PRIMARY_SVG_LEGACY}`;

    const { data: existingWebp } = await owner
      .from("product_images")
      .select("id, storage_path, is_primary")
      .eq("shop_id", shopId)
      .eq("product_id", product.id)
      .eq("storage_path", objectPath)
      .maybeSingle();

    if (existingWebp) {
      // Idempotent: keep deterministic path; do not re-upload or duplicate.
      reused += 1;
      continue;
    }

    const { data: legacySvg } = await owner
      .from("product_images")
      .select("id, storage_path, is_primary, sort_order")
      .eq("shop_id", shopId)
      .eq("product_id", product.id)
      .eq("storage_path", legacySvgPath)
      .maybeSingle();

    await ensureStorageObjectUpsert(
      owner,
      "shop-assets",
      objectPath,
      local,
      "image/webp",
    );
    uploaded += 1;

    if (legacySvg) {
      // Safe replacement of seed-owned synthetic SVG fixture only.
      const { error: updErr } = await owner
        .from("product_images")
        .update({ storage_path: objectPath })
        .eq("id", legacySvg.id);
      if (updErr) fail(`replace svg→webp ${product.sku}`, updErr);
      await removeStorageObjectQuiet(owner, "shop-assets", legacySvgPath);
      replaced += 1;
      continue;
    }

    const { count } = await owner
      .from("product_images")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", shopId)
      .eq("product_id", product.id);

    const { error: insErr } = await owner.from("product_images").insert({
      organization_id: orgId,
      shop_id: shopId,
      product_id: product.id,
      storage_path: objectPath,
      sort_order: 0,
      is_primary: (count ?? 0) === 0,
    });
    if (insErr) {
      if (/duplicate|unique/i.test(insErr.message)) {
        reused += 1;
        continue;
      }
      fail(`product_images insert ${product.sku}`, insErr);
    }
    created += 1;
  }

  console.log(
    `Product images: ${created} created, ${replaced} svg→webp replaced, ${reused} reused, ${uploaded} storage uploads (${products.length} DEMO products)`,
  );
  return { products: products.length, created, replaced, reused, uploaded };
}

async function seedRepairPhotos(owner, orgId, shopId, ownerUserId) {
  const repairSets = loadRepairPhotoSets();
  const { data: jobs, error } = await owner
    .from("repair_jobs")
    .select("id, reported_issue, internal_notes, shop_id, organization_id")
    .eq("shop_id", shopId)
    .order("created_at", { ascending: true });
  if (error) fail("list repair_jobs", error);

  let created = 0;
  let reused = 0;
  let replaced = 0;
  let uploaded = 0;
  let matchedJobs = 0;

  for (const set of repairSets) {
    const job = (jobs || []).find((j) =>
      (j.internal_notes || "").includes(set.marker),
    );
    if (!job) {
      console.log(`No repair matching ${set.marker} — skip photo set`);
      continue;
    }
    matchedJobs += 1;

    for (const photo of set.photos) {
      const local = join(ASSETS, "repairs", photo.file);
      if (!existsSync(local)) fail(`missing repair asset ${photo.file}`, new Error("file not found"));

      const objectPath = `${orgId}/${shopId}/${job.id}/demo-${photo.file}`;
      const legacyPngPath = `${orgId}/${shopId}/${job.id}/demo-${photo.legacy}`;

      const { data: existingWebp } = await owner
        .from("repair_photos")
        .select("id")
        .eq("repair_job_id", job.id)
        .eq("storage_path", objectPath)
        .maybeSingle();

      if (existingWebp) {
        // Idempotent reuse — repair_photos has no UPDATE policy; never rewrite rows.
        reused += 1;
        // If a seed PNG row still exists beside the WebP, remove it safely.
        const { data: strayPng } = await owner
          .from("repair_photos")
          .select("id")
          .eq("repair_job_id", job.id)
          .eq("storage_path", legacyPngPath)
          .maybeSingle();
        if (strayPng) {
          await deleteRepairPhotoViaRpc(owner, strayPng.id, legacyPngPath);
        }
        continue;
      }

      const { data: legacyPng } = await owner
        .from("repair_photos")
        .select("id")
        .eq("repair_job_id", job.id)
        .eq("storage_path", legacyPngPath)
        .maybeSingle();

      // Storage has insert+delete policies only — never upsert existing objects.
      const up = await ensureStorageObject(
        owner,
        "repair-photos",
        objectPath,
        local,
        "image/webp",
      );
      if (up.uploaded) uploaded += 1;

      const { error: insErr } = await owner.from("repair_photos").insert({
        organization_id: orgId,
        repair_job_id: job.id,
        storage_path: objectPath,
        caption: photo.caption,
        uploaded_by: ownerUserId,
      });
      if (insErr) {
        if (/duplicate|unique/i.test(insErr.message)) {
          reused += 1;
        } else {
          fail(`repair_photos insert ${photo.file}`, insErr);
        }
      } else {
        created += 1;
      }

      if (legacyPng) {
        await deleteRepairPhotoViaRpc(owner, legacyPng.id, legacyPngPath);
        replaced += 1;
      }
    }
  }

  console.log(
    `Repair photos: ${created} created, ${replaced} png→webp replaced, ${reused} reused, ${uploaded} uploads across ${matchedJobs} repairs`,
  );
  return { created, replaced, reused, uploaded, matchedJobs };
}

async function deleteRepairPhotoViaRpc(owner, photoId, storagePath) {
  const { data: authRows, error: authErr } = await owner.rpc(
    "authorize_repair_photo_deletion",
    { p_photo_id: photoId },
  );
  if (authErr) fail(`authorize_repair_photo_deletion ${photoId}`, authErr);
  const trusted =
    Array.isArray(authRows) && authRows[0]?.storage_path
      ? authRows[0].storage_path
      : storagePath;
  await removeStorageObjectQuiet(owner, "repair-photos", trusted);
  const { error: delErr } = await owner.rpc("delete_repair_photo", {
    p_photo_id: photoId,
  });
  if (delErr) fail(`delete_repair_photo ${photoId}`, delErr);
}

async function main() {
  const env = loadEnv();
  assertSafetyGuards(env);
  ensureAssets();

  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / ANON_KEY");

  const password =
    process.env.DEMO_SEED_PASSWORD || env.DEMO_SEED_PASSWORD;
  if (!password || password.length < 10) {
    throw new Error("DEMO_SEED_PASSWORD is required (min 10 chars).");
  }

  console.log("Demo image seed: signing in as demo owner…");
  const owner = await signIn(url, anon, OWNER_EMAIL, password);
  const {
    data: { user },
  } = await owner.auth.getUser();
  if (!user) throw new Error("No authenticated user after sign-in");

  const { orgId, shopId, shopName } = await resolveDemoTargets(owner, env);
  console.log(`Target: org=${orgId} shop=${shopId} (${shopName})`);

  const logo = await seedShopLogo(owner, orgId, shopId);
  const products = await seedProductImages(owner, orgId, shopId);
  const repairs = await seedRepairPhotos(owner, orgId, shopId, user.id);

  const { count: imgCount } = await owner
    .from("product_images")
    .select("id", { count: "exact", head: true })
    .eq("shop_id", shopId);
  const { count: photoCount } = await owner
    .from("repair_photos")
    .select("id", { count: "exact", head: true });

  console.log("\n=== Demo image seed complete ===");
  console.log(`product_images rows (shop): ${imgCount}`);
  console.log(`repair_photos rows (visible): ${photoCount}`);
  console.log(
    JSON.stringify(
      { logo, products, repairs },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err.message || err);
  process.exitCode = 1;
});

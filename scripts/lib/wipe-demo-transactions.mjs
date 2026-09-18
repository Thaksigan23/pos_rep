/**
 * Wipe DEMO transactional data for Demo Mobile Repair only.
 * Uses service-role for identity checks + DATABASE_URL SQL with
 * session_replication_role=replica so immutable-ledger / estimate-item
 * protect triggers do not block a disposable demo refresh.
 *
 * Does NOT delete org/shop/profiles/catalog masters.
 * Inventory movements for the shop are cleared and stocks reset to 0 so
 * purchases can be re-received through RPCs.
 */
import fs from "node:fs";
import pg from "pg";

function loadDatabaseUrl() {
  const raw = fs.readFileSync(new URL("../../.env.local", import.meta.url), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const key = line.slice(0, i).trim();
    if (key === "DATABASE_URL") return line.slice(i + 1).trim();
  }
  return process.env.DATABASE_URL || null;
}

export async function wipeDemoTransactions(admin, { orgId, shopId }) {
  if (!orgId || !shopId) throw new Error("wipeDemoTransactions requires orgId + shopId");

  const { data: org } = await admin
    .from("organizations")
    .select("id, name")
    .eq("id", orgId)
    .maybeSingle();
  if (!org || org.name !== "Demo Mobile Solutions") {
    throw new Error("Refusing wipe — organization is not Demo Mobile Solutions");
  }
  const { data: shop } = await admin
    .from("shops")
    .select("id, name, organization_id")
    .eq("id", shopId)
    .maybeSingle();
  if (!shop || shop.organization_id !== orgId || shop.name !== "Demo Mobile Repair") {
    throw new Error("Refusing wipe — shop is not Demo Mobile Repair under demo org");
  }

  const databaseUrl = loadDatabaseUrl();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for demo transaction wipe (trigger bypass)");
  }

  // Strip sslmode from URL — pg v8+ treats require as verify-full and fails on pooler certs.
  const connectionString = databaseUrl
    .replace(/[?&]sslmode=[^&]*/gi, "")
    .replace(/\?&/, "?")
    .replace(/\?$/, "");

  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    await client.query("begin");
    // Bypass BEFORE DELETE/UPDATE protect triggers for disposable DEMO rebuild only.
    await client.query("set local session_replication_role = replica");

    const repairRes = await client.query(
      `select id from public.repair_jobs where shop_id = $1`,
      [shopId],
    );
    const repairIds = repairRes.rows.map((r) => r.id);

    const saleRes = await client.query(
      `select id from public.sales
       where shop_id = $1 and notes ilike '%DEMO%'`,
      [shopId],
    );
    const saleIds = saleRes.rows.map((r) => r.id);

    const purchaseRes = await client.query(
      `select id from public.purchases
       where shop_id = $1 and notes ilike '%DEMO%'`,
      [shopId],
    );
    const purchaseIds = purchaseRes.rows.map((r) => r.id);

    if (repairIds.length) {
      await client.query(
        `delete from public.warranty_claims
         where warranty_id in (
           select id from public.warranties where repair_job_id = any($1::uuid[])
         )`,
        [repairIds],
      );
      await client.query(
        `delete from public.warranties where repair_job_id = any($1::uuid[])`,
        [repairIds],
      );
      await client.query(
        `delete from public.repair_photos where repair_job_id = any($1::uuid[])`,
        [repairIds],
      );
      await client.query(
        `delete from public.repair_part_costs
         where repair_part_id in (
           select id from public.repair_parts where repair_job_id = any($1::uuid[])
         )`,
        [repairIds],
      );
      await client.query(
        `delete from public.repair_parts where repair_job_id = any($1::uuid[])`,
        [repairIds],
      );
      await client.query(
        `delete from public.repair_estimate_items
         where estimate_id in (
           select id from public.repair_estimates where repair_job_id = any($1::uuid[])
         )`,
        [repairIds],
      );
      await client.query(
        `delete from public.repair_estimates where repair_job_id = any($1::uuid[])`,
        [repairIds],
      );
      await client.query(
        `delete from public.repair_status_history where repair_job_id = any($1::uuid[])`,
        [repairIds],
      );
      await client.query(
        `delete from public.repair_accessories where repair_job_id = any($1::uuid[])`,
        [repairIds],
      );
      await client.query(
        `delete from public.device_intake_checks where repair_job_id = any($1::uuid[])`,
        [repairIds],
      );
      await client.query(
        `delete from public.payments
         where reference_type = 'repair' and reference_id = any($1::uuid[])`,
        [repairIds],
      );
      await client.query(`delete from public.repair_jobs where id = any($1::uuid[])`, [
        repairIds,
      ]);
    }

    if (saleIds.length) {
      await client.query(`delete from public.refunds where sale_id = any($1::uuid[])`, [
        saleIds,
      ]);
      await client.query(
        `delete from public.payments
         where reference_type = 'sale' and reference_id = any($1::uuid[])`,
        [saleIds],
      );
      await client.query(
        `delete from public.sale_item_costs
         where sale_item_id in (
           select id from public.sale_items where sale_id = any($1::uuid[])
         )`,
        [saleIds],
      );
      await client.query(`delete from public.sale_items where sale_id = any($1::uuid[])`, [
        saleIds,
      ]);
      await client.query(`delete from public.sales where id = any($1::uuid[])`, [saleIds]);
    }

    await client.query(
      `delete from public.sales where shop_id = $1 and notes ilike '%DEMO%'`,
      [shopId],
    );

    if (purchaseIds.length) {
      await client.query(
        `delete from public.purchase_items where purchase_id = any($1::uuid[])`,
        [purchaseIds],
      );
      await client.query(`delete from public.purchases where id = any($1::uuid[])`, [
        purchaseIds,
      ]);
    }

    await client.query(
      `delete from public.expenses
       where shop_id = $1 and description ilike '%DEMO%'`,
      [shopId],
    );

    await client.query(`delete from public.inventory_movements where shop_id = $1`, [
      shopId,
    ]);
    await client.query(
      `update public.product_stocks set quantity = 0 where shop_id = $1`,
      [shopId],
    );

    await client.query(
      `delete from public.notifications where organization_id = $1`,
      [orgId],
    );

    await client.query("commit");
    return {
      repairs: repairIds.length,
      sales: saleIds.length,
      purchases: purchaseIds.length,
    };
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      /* ignore */
    }
    throw error;
  } finally {
    await client.end();
  }
}

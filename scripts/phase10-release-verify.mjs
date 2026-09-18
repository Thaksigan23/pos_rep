/**
 * Phase 10 release verification helpers.
 * Never prints secret values.
 */
import fs from "node:fs"
import pg from "pg"

function loadEnv() {
  const raw = fs.readFileSync(".env.local", "utf8")
  const env = {}
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue
    const i = line.indexOf("=")
    env[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  return env
}

const env = loadEnv()
const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

const results = []
function record(name, ok, detail = "") {
  results.push({ name, ok: !!ok, detail: String(detail || "") })
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`)
}

async function main() {
  await client.connect()

  const rls = await client.query(`
    select c.relname as table_name,
           c.relrowsecurity as rls,
           c.relforcerowsecurity as force_rls
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname in (
        'organizations','shops','shop_settings','profiles','shop_members',
        'products','product_costs','product_stocks','inventory_movements',
        'sales','sale_items','sale_item_costs','payments','refunds','refund_items',
        'repair_jobs','customers','expenses','warranties','warranty_claims',
        'notifications','notification_outbox','audit_logs','purchases'
      )
    order by 1
  `)
  const missingRls = rls.rows.filter((r) => !r.rls || !r.force_rls)
  record(
    "FORCE RLS on critical tables",
    missingRls.length === 0,
    missingRls.length
      ? missingRls.map((r) => `${r.table_name}:rls=${r.rls}/force=${r.force_rls}`).join("; ")
      : `${rls.rows.length} tables ok`
  )

  const defs = await client.query(`
    select p.proname,
           has_function_privilege('authenticated', p.oid, 'execute') as auth_exec,
           prosecdef as security_definer
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'enqueue_notification','write_audit_log','assert_line_discount_allowed',
        'apply_inventory_movement','ensure_stock_row','current_organization_id',
        'complete_sale','refund_sale','record_payment','dashboard_summary',
        'assign_staff_profile','update_staff_profile','update_shop_settings'
      )
  `)
  const by = Object.fromEntries(defs.rows.map((r) => [r.proname, r]))
  record(
    "internal helpers revoked from authenticated",
    ["enqueue_notification", "write_audit_log", "assert_line_discount_allowed"].every(
      (n) => by[n] && by[n].auth_exec === false
    ),
    ["enqueue_notification", "write_audit_log", "assert_line_discount_allowed"]
      .map((n) => `${n}=${by[n]?.auth_exec}`)
      .join(", ")
  )
  record(
    "core RPCs executable by authenticated",
    ["complete_sale", "refund_sale", "record_payment", "dashboard_summary", "assign_staff_profile"].every(
      (n) => by[n] && by[n].auth_exec === true && by[n].security_definer === true
    )
  )

  const mig = await client.query(`
    select version from supabase_migrations.schema_migrations order by version
  `).catch(async () => {
    // alternate table name
    return client.query(`select version from supabase_migrations.schema_migrations order by 1`)
  }).catch(() => ({ rows: [] }))

  const files = fs
    .readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .map((f) => f.replace(/\.sql$/, "").split("_")[0])
    .sort()

  const applied = mig.rows.map((r) => String(r.version))
  // Compare by migration timestamp prefix
  const notApplied = files.filter((ts) => !applied.some((a) => a.startsWith(ts)))
  const extraApplied = applied.filter((a) => !files.some((ts) => a.startsWith(ts)))

  record(
    "migration versions match repo files",
    notApplied.length === 0 && extraApplied.length === 0,
    notApplied.length || extraApplied.length
      ? `notApplied=${notApplied.join(",")} extra=${extraApplied.join(",")}`
      : `applied=${applied.length} files=${files.length}`
  )

  const buckets = await client.query(`
    select id, name, public from storage.buckets where id in ('shop-assets','repair-photos') order by id
  `)
  record(
    "storage buckets private",
    buckets.rows.length === 2 && buckets.rows.every((b) => b.public === false),
    buckets.rows.map((b) => `${b.id}:public=${b.public}`).join(", ")
  )

  const storagePolicies = await client.query(`
    select policyname, tablename, cmd
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
    order by policyname
  `)
  record(
    "storage.objects has policies",
    storagePolicies.rows.length > 0,
    `${storagePolicies.rows.length} policies`
  )

  // Inventory sanity: controlled product in disposable org via service — skip; use dedicated flow below with auth users from suite
  // Connectivity: simple select
  const { rows: one } = await client.query(`select count(*)::int as n from public.shops`)
  record("DATABASE_URL connectivity", one[0].n >= 0, `shops=${one[0].n}`)

  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} phase10 security checks passed`)
  if (failed.length) {
    for (const f of failed) console.error(` - ${f.name}: ${f.detail}`)
    process.exitCode = 1
  }
  await client.end()
}

main().catch((e) => {
  console.error("FAIL", e.message)
  process.exitCode = 1
})

/**
 * Phase 10 credential / env readiness checks.
 * Never prints secret values — only presence, shape, and comparison outcomes.
 */
import fs from "node:fs"
import path from "node:path"
import pg from "pg"

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return null
  const env = {}
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue
    const i = line.indexOf("=")
    env[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  return env
}

function maskShape(value) {
  if (!value) return "missing"
  return `len=${value.length};hasScheme=${/^postgres(ql)?:\/\//i.test(value)};hasPlaceholder=${/YOUR_|CHANGE_ME|example\.com/i.test(value)}`
}

function record(results, name, ok, detail = "") {
  results.push({ name, ok: !!ok, detail: String(detail || "") })
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`)
}

function walkFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (
      entry.name === "node_modules" ||
      entry.name === ".next" ||
      entry.name === ".git"
    ) {
      continue
    }
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkFiles(full, out)
    else out.push(full)
  }
  return out
}

const results = []
const root = process.cwd()
const gitignore = fs.existsSync(".gitignore")
  ? fs.readFileSync(".gitignore", "utf8")
  : ""
record(
  results,
  ".gitignore covers .env.local",
  /\.env\.local/.test(gitignore) || /\.env\*/.test(gitignore),
  gitignore ? "present" : "missing .gitignore"
)

const envLocal = loadEnvFile(".env.local")
const envExample = loadEnvFile(".env.example")
record(results, ".env.local exists", !!envLocal)
record(results, ".env.example exists", !!envExample)

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "DATABASE_URL",
]
for (const key of required) {
  const val = envLocal?.[key]
  record(
    results,
    `${key} present in .env.local`,
    !!val && val.length > 8 && !/YOUR_|CHANGE_ME/.test(val),
    val ? `len=${val.length}` : "missing"
  )
}

if (envExample?.DATABASE_URL && envLocal?.DATABASE_URL) {
  record(
    results,
    "DATABASE_URL not equal to .env.example placeholder",
    envLocal.DATABASE_URL !== envExample.DATABASE_URL,
    `local=${maskShape(envLocal.DATABASE_URL)} example=${maskShape(envExample.DATABASE_URL)}`
  )
}

record(
  results,
  "SERVICE_ROLE key differs from anon key",
  !!envLocal?.SUPABASE_SERVICE_ROLE_KEY &&
    envLocal.SUPABASE_SERVICE_ROLE_KEY !== envLocal.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  "compared by equality only"
)

const secretPatterns = [
  /postgresql:\/\/[^:\s]+:[^@\s]+@/i,
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./,
  /service_role/i,
]
const scanned = walkFiles(root).filter((f) => {
  const rel = path.relative(root, f).replace(/\\/g, "/")
  if (rel.startsWith("node_modules/") || rel.startsWith(".next/")) return false
  if (rel === ".env.local") return false
  return /\.(ts|tsx|js|mjs|cjs|json|md|sql|yml|yaml)$/i.test(rel)
})

const leaks = []
for (const file of scanned) {
  let text = ""
  try {
    text = fs.readFileSync(file, "utf8")
  } catch {
    continue
  }
  // Skip huge generated reports that may embed URLs only
  if (text.length > 2_000_000) continue
  const rel = path.relative(root, file).replace(/\\/g, "/")
  if (envLocal?.DATABASE_URL && text.includes(envLocal.DATABASE_URL)) {
    leaks.push(`${rel}:DATABASE_URL`)
  }
  if (
    envLocal?.SUPABASE_SERVICE_ROLE_KEY &&
    text.includes(envLocal.SUPABASE_SERVICE_ROLE_KEY)
  ) {
    leaks.push(`${rel}:SERVICE_ROLE`)
  }
}
record(
  results,
  "no live secrets copied into tracked source/docs",
  leaks.length === 0,
  leaks.length ? leaks.slice(0, 10).join("; ") : `scanned=${scanned.length} files`
)

// Connectivity with current DATABASE_URL (does NOT prove rotation)
let connected = false
let connectDetail = ""
try {
  const client = new pg.Client({
    connectionString: envLocal.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  })
  await client.connect()
  const { rows } = await client.query("select current_database() as db")
  connected = true
  connectDetail = `db=${rows[0].db}`
  await client.end()
} catch (e) {
  connectDetail = e.message
}
record(results, "current DATABASE_URL connects", connected, connectDetail)

const exposedHint = process.env.PREVIOUSLY_EXPOSED_DB_PASSWORD || ""
if (exposedHint) {
  const sameAsCurrent = envLocal?.DATABASE_URL?.includes(`:${exposedHint}@`)
  record(
    results,
    "current DATABASE_URL does not embed previously exposed password",
    !sameAsCurrent,
    sameAsCurrent ? "MATCHES exposed password (BLOCKER)" : "no embed match"
  )
} else {
  record(
    results,
    "rotation proof for previously exposed DB password",
    false,
    "UNPROVEN — no PREVIOUSLY_EXPOSED_DB_PASSWORD provided; connection success alone is not rotation evidence"
  )
}

const failed = results.filter((r) => !r.ok)
console.log(
  `\n${results.length - failed.length}/${results.length} credential/env checks passed`
)
if (failed.length) {
  for (const f of failed) console.error(` - ${f.name}: ${f.detail}`)
  process.exitCode = 1
}

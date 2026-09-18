import { readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"
import { chromium } from "playwright-core"

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const i = line.indexOf("=")
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()]
    })
)

const admin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

const { data: photos, error } = await admin
  .from("repair_photos")
  .select("repair_job_id")
  .limit(800)

if (error) throw error

const counts = {}
for (const row of photos || []) {
  counts[row.repair_job_id] = (counts[row.repair_job_id] || 0) + 1
}
const multi = Object.entries(counts)
  .filter(([, n]) => n >= 2)
  .sort((a, b) => b[1] - a[1])[0]

if (!multi) {
  console.log(JSON.stringify({ multiRepair: null }))
  process.exit(1)
}

const [repairId, count] = multi
const PASSWORD = process.env.DEMO_PASSWORD || "DemoMobile@2026"
const browser = await chromium.launch({ channel: "chrome", headless: true })
const page = await (
  await browser.newContext({ viewport: { width: 1440, height: 900 } })
).newPage()

await page.goto("http://localhost:3000/login", {
  waitUntil: "domcontentloaded",
})
await page.fill(
  "input[type=email], input[name=email]",
  "owner@demo.mobilepos.local"
)
await page.fill("input[type=password], input[name=password]", PASSWORD)
await page.click("button[type=submit]")
await page.waitForURL((url) => !url.pathname.includes("/login"), {
  timeout: 60000,
})
await page.goto(`http://localhost:3000/repairs/${repairId}`, {
  waitUntil: "domcontentloaded",
})
await page.waitForTimeout(1500)
await page.getByRole("tab", { name: /Photos/i }).click()
await page.waitForTimeout(1000)
await page.locator('button[aria-label^="View"]').first().click()
await page.waitForTimeout(500)

async function counter() {
  return page.evaluate(() => {
    const dialog = document.querySelector("[role=dialog]")
    const spans = [...(dialog?.querySelectorAll("span") || [])].map((s) =>
      s.textContent.trim()
    )
    return spans.find((t) => /\d+\s*\/\s*\d+/.test(t)) || null
  })
}

const initial = {
  open: await page.evaluate(() => !!document.querySelector("[role=dialog]")),
  counter: await counter(),
  hasPrev: await page.getByRole("button", { name: "Previous photo" }).count(),
  hasNext: await page.getByRole("button", { name: "Next photo" }).count(),
}

if (initial.hasNext) {
  await page.getByRole("button", { name: "Next photo" }).click()
  await page.waitForTimeout(300)
}
const afterNext = await counter()

await page.getByRole("button", { name: "Previous photo" }).click()
await page.waitForTimeout(300)
const afterPrev = await counter()

await page.keyboard.press("ArrowRight")
await page.waitForTimeout(300)
const afterArrowRight = await counter()

await page.keyboard.press("ArrowLeft")
await page.waitForTimeout(300)
const afterArrowLeft = await counter()

await page.keyboard.press("Escape")
await page.waitForTimeout(300)
const closed = await page.evaluate(
  () => !document.querySelector("[role=dialog]")
)

console.log(
  JSON.stringify(
    {
      multiRepair: { id: repairId, count },
      lightbox: {
        ...initial,
        afterNext,
        afterPrev,
        afterArrowRight,
        afterArrowLeft,
        closed,
      },
    },
    null,
    2
  )
)

await browser.close()
process.exitCode =
  initial.open &&
  initial.hasNext > 0 &&
  afterNext === "2 / 3" &&
  afterPrev === "1 / 3" &&
  closed
    ? 0
    : 1

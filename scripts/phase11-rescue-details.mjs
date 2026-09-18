import { chromium } from "playwright-core"
import { readFileSync, writeFileSync } from "fs"

const BASE = "http://localhost:3000"
const EMAIL = "owner@demo.mobilepos.local"
const PASSWORD = process.env.DEMO_PASSWORD || "DemoMobile@2026"
const REPORT = "D:/personal_projects/mobilepos/scripts/phase11-report.json"

async function wait(page, ms = 1800) {
  await page.waitForTimeout(ms)
}

async function scan(page) {
  return page.evaluate(() => {
    const bodyText = document.body?.innerText || ""
    const badTokens = [...new Set((bodyText.match(/\b(null|undefined|NaN|\[object Object\])\b/g) || []))]
    const demoColonCount = (bodyText.match(/DEMO:/g) || []).length
    const imgs = Array.from(document.images || [])
    const brokenImgCount = imgs.filter((img) => !img.complete || img.naturalWidth === 0).length
    const overflowX = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    return {
      href: location.href,
      title: document.title,
      badTokens,
      demoColonCount,
      brokenImgCount,
      overflowX,
      snippet: bodyText.replace(/\s+/g, " ").trim().slice(0, 200),
      tabLabels: Array.from(document.querySelectorAll('[role="tab"]')).map((t) => t.textContent?.trim()),
      hasDialog: !!document.querySelector('[role="dialog"]'),
    }
  })
}

function firstRealDetail(hrefs, prefix) {
  return hrefs.find((h) => {
    if (!h || !h.includes(prefix)) return false
    if (h.includes("/new") || h.includes("?")) return false
    const rest = h.split(prefix)[1] || ""
    const id = rest.split("/")[0]
    return id && id.length > 8
  })
}

const browser = await chromium.launch({ channel: "chrome", headless: true })
const page = await browser.newContext({ viewport: { width: 1440, height: 900 } }).then((c) => c.newPage())

await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" })
await wait(page, 1500)
await page.locator("#email").fill(EMAIL)
await page.locator("#password").fill(PASSWORD)
await page.getByRole("button", { name: /sign in/i }).click()
await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 90000 })
await wait(page, 2000)

const defects = []
const results = {}

// repairs
await page.goto(`${BASE}/repairs`, { waitUntil: "domcontentloaded" })
await wait(page)
const repairHrefs = await page.evaluate(() =>
  Array.from(document.querySelectorAll("a[href]")).map((a) => a.getAttribute("href")),
)
const repairHref = firstRealDetail(repairHrefs, "/repairs/")
results.repair_list_hrefs_sample = repairHrefs.filter((h) => h?.includes("/repairs/")).slice(0, 10)
results.repair_detail_url = repairHref

if (repairHref) {
  await page.goto(repairHref.startsWith("http") ? repairHref : BASE + repairHref, { waitUntil: "domcontentloaded" })
  await wait(page, 2000)
  const tabNames = ["Status", "Details", "Estimates", "Parts", "Photos", "Payments", "History"]
  const tabsFound = {}
  for (const tab of tabNames) {
    const loc = page.getByRole("tab", { name: new RegExp(tab, "i") })
    tabsFound[tab] = (await loc.count()) > 0
    if (tabsFound[tab]) {
      await loc.first().click().catch(() => {})
      await wait(page, 500)
    }
  }
  if (tabsFound.Photos) {
    await page.getByRole("tab", { name: /photos/i }).first().click().catch(() => {})
    await wait(page, 1200)
  }
  let lightbox = false
  const photoBtn = page.locator("main img, [role='tabpanel'] img").first()
  if (await photoBtn.count()) {
    await photoBtn.click({ timeout: 2000 }).catch(() => {})
    await wait(page, 800)
    lightbox = await page.evaluate(() => !!document.querySelector('[role="dialog"]'))
  }
  const s = await scan(page)
  results.repair_smoke = { url: s.href, tabsFound, lightbox, ...s }
  if (s.demoColonCount > 0) {
    defects.push({
      severity: "SMALL_PRESENTATION",
      route: s.href,
      issue: "DEMO: in repair detail/photos",
      guessPath: "features/repairs/**",
      repro: "Open repair detail → Photos",
    })
  }
  if (!Object.values(tabsFound).some(Boolean)) {
    defects.push({
      severity: "SMALL_PRESENTATION",
      route: s.href,
      issue: "Expected repair detail tabs not found",
      guessPath: "features/repairs/components/**",
      repro: `Open ${s.href}`,
    })
  }
} else {
  defects.push({
    severity: "SMALL_PRESENTATION",
    route: "/repairs",
    issue: "No repair detail link found (only /new?)",
    repro: "Open /repairs as Owner",
  })
  results.repair_smoke = { error: "no_repair_detail_link", sample: results.repair_list_hrefs_sample }
}

// customers / products real details
for (const [list, prefix, key] of [
  ["/customers", "/customers/", "customer"],
  ["/products", "/products/", "product"],
]) {
  await page.goto(BASE + list, { waitUntil: "domcontentloaded" })
  await wait(page)
  const hrefs = await page.evaluate(() =>
    Array.from(document.querySelectorAll("a[href]")).map((a) => a.getAttribute("href")),
  )
  const href = firstRealDetail(hrefs, prefix)
  results[`${key}_detail_url`] = href
  if (href) {
    await page.goto(href.startsWith("http") ? href : BASE + href, { waitUntil: "domcontentloaded" })
    await wait(page)
    results[`${key}_detail`] = await scan(page)
  }
}

// mobile repair detail photos if we have one
if (results.repair_smoke?.url && !results.repair_smoke.error) {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(results.repair_smoke.url, { waitUntil: "domcontentloaded" })
  await wait(page)
  const photos = page.getByRole("tab", { name: /photos/i })
  if (await photos.count()) await photos.first().click().catch(() => {})
  await wait(page, 1000)
  const ms = await scan(page)
  results.mobile_repair_detail = ms
  if (ms.overflowX) {
    defects.push({
      severity: "SMALL_PRESENTATION",
      route: ms.href,
      issue: "mobile overflowX on repair detail",
      repro: "390x844 repair detail Photos",
    })
  }
}

const report = JSON.parse(readFileSync(REPORT, "utf8"))
report.repair_smoke = results.repair_smoke
report.detail_rescans = results
report.defects = [...(report.defects || []), ...defects]
report.screens_tested = [
  ...new Set([
    ...(report.screens_tested || []),
    ...(results.repair_smoke?.url ? ["repair_detail_real"] : []),
    ...(results.customer_detail_url ? ["customer_detail_real"] : []),
    ...(results.product_detail_url ? ["product_detail_url_real"] : []),
    ...(results.mobile_repair_detail ? ["mobile_repair_detail_real"] : []),
  ]),
]
if (results.repair_smoke?.error) {
  report.screens_failed = [...new Set([...(report.screens_failed || []), "repair_detail_real"])]
}
writeFileSync(REPORT, JSON.stringify(report, null, 2))
console.log(JSON.stringify({ defects, repair_smoke: results.repair_smoke, customer: results.customer_detail_url, product: results.product_detail_url, mobile: results.mobile_repair_detail?.overflowX }, null, 2))
await browser.close()

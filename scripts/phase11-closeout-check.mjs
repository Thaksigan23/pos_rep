import { chromium } from "playwright-core"

const PASSWORD = process.env.DEMO_PASSWORD || "DemoMobile@2026"
const BASE = "http://localhost:3000"

const browser = await chromium.launch({ channel: "chrome", headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()
const hydrations = []

page.on("console", (msg) => {
  const text = msg.text()
  if (/hydrat/i.test(text)) {
    hydrations.push({
      type: msg.type(),
      text: text.slice(0, 400),
      url: page.url(),
    })
  }
})

await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 })
await page.waitForSelector("input[type=email], input[name=email]", { timeout: 30000 })
await page.fill("input[type=email], input[name=email]", "owner@demo.mobilepos.local")
await page.fill("input[type=password], input[name=password]", PASSWORD)
await page.click("button[type=submit]")
await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 60000 })

await page.goto(`${BASE}/pos`, { waitUntil: "networkidle", timeout: 60000 })
await page.waitForTimeout(2500)

const posScan = await page.evaluate(() => ({
  href: location.href,
  title: document.title,
  hasSearch: !!document.querySelector(
    'input[aria-label*="Search products"], input[placeholder*="Search"]'
  ),
  paymentMethodId:
    document.querySelector("[id^=pay-method-]")?.id || null,
  heldControls: /Held/i.test(document.body.innerText),
}))

await page.goto(`${BASE}/repairs`, { waitUntil: "domcontentloaded", timeout: 60000 })
await page.waitForTimeout(1500)

const repairHref = await page.evaluate(() => {
  const links = [...document.querySelectorAll('a[href*="/repairs/"]')]
    .map((a) => a.getAttribute("href"))
    .filter((h) => h && !h.endsWith("/new") && !h.endsWith("/repairs/"))
  return links[0] || null
})

let repairDate = null
let lightbox = null

if (repairHref) {
  await page.goto(`${BASE}${repairHref}`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  })
  await page.waitForTimeout(1500)

  repairDate = await page.evaluate(() => {
    const text = document.body.innerText
    const match = text.match(/Created\s+[^\n]+/)
    return {
      createdLine: match ? match[0].trim() : null,
      hasSlashDate: /Created\s+\d{1,2}\/\d{1,2}\/\d{4}/.test(text),
      hasShortMonth: /Created\s+[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}/.test(text),
    }
  })

  const photosTab = page.getByRole("tab", { name: /Photos/i })
  if (await photosTab.count()) {
    await photosTab.click()
    await page.waitForTimeout(1000)
    const photoBtn = page.locator('button[aria-label^="View"]').first()
    if (await photoBtn.count()) {
      await photoBtn.click()
      await page.waitForTimeout(500)
      lightbox = await page.evaluate(() => {
        const dialog = document.querySelector("[role=dialog]")
        const buttons = dialog
          ? [...dialog.querySelectorAll("button")].map((b) => ({
              text: (b.textContent || "").trim(),
              label: b.getAttribute("aria-label") || "",
            }))
          : []
        return {
          open: !!dialog,
          title:
            dialog
              ?.querySelector("h2, [data-slot=dialog-title]")
              ?.textContent?.trim() || null,
          hasPrev: buttons.some(
            (b) => /Previous/i.test(b.text) || b.label === "Previous photo"
          ),
          hasNext: buttons.some(
            (b) => /Next/i.test(b.text) || b.label === "Next photo"
          ),
          hasClose: buttons.some((b) => /Close/i.test(b.label)),
        }
      })
      await page.keyboard.press("Escape")
      await page.waitForTimeout(300)
      lightbox.closeWorks = !(await page.evaluate(
        () => !!document.querySelector("[role=dialog]")
      ))
    } else {
      lightbox = { open: false, reason: "no viewable photos" }
    }
  } else {
    lightbox = { open: false, reason: "no photos tab" }
  }
}

const report = {
  hydrations,
  hydrationWarningCount: hydrations.length,
  posScan,
  repairHref,
  repairDate,
  lightbox,
}

console.log(JSON.stringify(report, null, 2))
await browser.close()

const fail =
  hydrations.length > 0 ||
  repairDate?.hasSlashDate ||
  !repairDate?.hasShortMonth ||
  !lightbox?.open ||
  !lightbox?.closeWorks

process.exitCode = fail ? 1 : 0

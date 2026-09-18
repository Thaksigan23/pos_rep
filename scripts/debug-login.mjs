import { chromium } from "playwright-core"

const PASSWORD = process.env.DEMO_PASSWORD || "DemoMobile@2026"

const browser = await chromium.launch({ channel: "chrome", headless: true })
const page = await browser.newContext({ viewport: { width: 1440, height: 900 } }).then((c) => c.newPage())
page.on("console", (m) => console.log("CONSOLE", m.type(), m.text().slice(0, 200)))
await page.goto("http://localhost:3000/login", { waitUntil: "networkidle", timeout: 60000 })
await page.waitForTimeout(1500)
const fields = await page.evaluate(() =>
  Array.from(document.querySelectorAll("input,button")).map((el) => ({
    tag: el.tagName,
    type: el.type,
    name: el.name,
    id: el.id,
    placeholder: el.placeholder,
    text: el.innerText?.slice(0, 40),
  })),
)
console.log("FIELDS", JSON.stringify(fields, null, 2))

await page.locator("#email").click()
await page.locator("#email").fill("owner@demo.mobilepos.local")
await page.locator("#password").click()
await page.locator("#password").fill(PASSWORD)
await page.getByRole("button", { name: /sign in/i }).click()
await page.waitForTimeout(5000)
console.log("URL", page.url())
const body = await page.locator("body").innerText()
console.log("BODY", body.slice(0, 800))
const alert = await page.locator('[role="alert"]').innerText().catch(() => null)
console.log("ALERT", alert)
await browser.close()

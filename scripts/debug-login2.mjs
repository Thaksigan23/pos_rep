import { chromium } from "playwright-core"

const PASSWORD = process.env.DEMO_PASSWORD || "DemoMobile@2026"

const browser = await chromium.launch({ channel: "chrome", headless: true })
const page = await browser.newContext({ viewport: { width: 1440, height: 900 } }).then((c) => c.newPage())
page.on("response", (r) => {
  const u = r.url()
  if (u.includes("login") || u.includes("auth") || u.includes("supabase") || r.request().method() === "POST") {
    console.log("RESP", r.status(), r.request().method(), u.slice(0, 160))
  }
})
await page.goto("http://localhost:3000/login", { waitUntil: "domcontentloaded", timeout: 60000 })
await page.waitForTimeout(2000)
await page.locator("#email").fill("owner@demo.mobilepos.local")
await page.locator("#password").fill(PASSWORD)
await page.getByRole("button", { name: /sign in/i }).click()
for (let i = 0; i < 20; i++) {
  await page.waitForTimeout(1500)
  const url = page.url()
  const btn = await page.getByRole("button").filter({ hasText: /sign/i }).innerText().catch(() => "")
  const alert = await page.locator('[role="alert"]').innerText().catch(() => "")
  console.log(i, "URL", url, "BTN", btn.slice(0, 40), "ALERT", alert.slice(0, 120))
  if (!url.includes("/login")) break
  if (alert) break
  if (!/Signing in/i.test(btn) && i > 2) break
}
console.log("FINAL", page.url())
console.log((await page.locator("body").innerText()).slice(0, 400))
await browser.close()

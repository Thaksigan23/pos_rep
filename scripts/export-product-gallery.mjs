import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"

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

const shopId = "00df202d-2ef0-4a20-b2ca-b4e5de80ba92"

const { data: products, error } = await admin
  .from("products")
  .select(
    "id,name,sku,barcode,selling_price,track_inventory,is_active,product_images(storage_path,sort_order,is_primary),product_stocks!inner(quantity,shop_id)"
  )
  .eq("product_stocks.shop_id", shopId)
  .order("name")

if (error) throw error

const paths = []
for (const p of products || []) {
  const imgs = (p.product_images || []).slice().sort((a, b) => {
    if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1
    return (a.sort_order ?? 0) - (b.sort_order ?? 0)
  })
  p._path = imgs[0]?.storage_path || null
  if (p._path) paths.push(p._path)
}

const signedMap = new Map()
const unique = [...new Set(paths)]
if (unique.length) {
  const { data: signed, error: signError } = await admin.storage
    .from("shop-assets")
    .createSignedUrls(unique, 60 * 60)
  if (signError) console.error("sign error:", signError.message)
  for (const row of signed || []) {
    if (row.path && row.signedUrl) signedMap.set(row.path, row.signedUrl)
  }
}

const rows = (products || []).map((p) => {
  const stockRow = Array.isArray(p.product_stocks)
    ? p.product_stocks[0]
    : p.product_stocks
  return {
    name: p.name,
    sku: p.sku,
    barcode: p.barcode,
    price: Number(p.selling_price || 0),
    stock: Number(stockRow?.quantity ?? 0),
    active: p.is_active,
    image: p._path ? signedMap.get(p._path) || null : null,
  }
})

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

const cards = rows
  .map((r) => {
    const img = r.image
      ? `<img src="${esc(r.image)}" alt="${esc(r.name)}" loading="lazy" />`
      : `<div class="ph">No image</div>`
    const price = r.price.toLocaleString("en-LK", { minimumFractionDigits: 2 })
    return `<article class="card">${img}<div class="meta"><h2>${esc(r.name)}</h2><p class="sku">${esc(r.sku)}</p><p class="price">LKR ${price}</p><p class="stock">Stock: ${r.stock}${r.active ? "" : " (inactive)"}</p><p class="bc">${esc(r.barcode)}</p></div></article>`
  })
  .join("\n")

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>MobilePOS Product Gallery</title>
<style>
  :root { color-scheme: dark; font-family: system-ui, sans-serif; }
  body { margin: 0; background: #0b1220; color: #e8eefc; }
  header { padding: 20px 24px; border-bottom: 1px solid #243044; position: sticky; top: 0; background: #0b1220cc; backdrop-filter: blur(8px); z-index: 1; }
  h1 { margin: 0 0 4px; font-size: 20px; }
  .sub { color: #9db0d0; font-size: 13px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; padding: 20px 24px 40px; }
  .card { background: #121a2b; border: 1px solid #243044; border-radius: 14px; overflow: hidden; }
  .card img, .ph { width: 100%; aspect-ratio: 1; object-fit: cover; background: #1a2438; display: block; }
  .ph { display: grid; place-items: center; color: #7f92b3; font-size: 13px; }
  .meta { padding: 12px; }
  h2 { margin: 0 0 6px; font-size: 14px; line-height: 1.3; }
  .sku, .bc, .stock { margin: 0; color: #9db0d0; font-size: 12px; }
  .price { margin: 8px 0; font-weight: 700; color: #8dde9a; }
</style>
</head>
<body>
<header>
  <h1>All products — Demo Mobile Repair</h1>
  <div class="sub">${rows.length} products · images signed for ~1 hour · open this file in your browser</div>
</header>
<main class="grid">
${cards}
</main>
</body>
</html>`

mkdirSync("tmp", { recursive: true })
writeFileSync("tmp/product-gallery.json", JSON.stringify(rows, null, 2))
writeFileSync("tmp/product-gallery.html", html)

console.log(
  JSON.stringify(
    {
      count: rows.length,
      withImage: rows.filter((r) => r.image).length,
      html: "tmp/product-gallery.html",
      products: rows.map((r) => ({
        name: r.name,
        sku: r.sku,
        price: r.price,
        stock: r.stock,
        hasImage: Boolean(r.image),
      })),
    },
    null,
    2
  )
)

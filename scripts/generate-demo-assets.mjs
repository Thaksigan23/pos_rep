/**
 * Generate synthetic PNG/SVG demo fixtures (no external scrapes).
 * Run: node scripts/generate-demo-assets.mjs
 *
 * Products/shop: SVG (allowed in shop-assets)
 * Repairs: PNG (repair-photos does not allow SVG)
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "demo-assets");

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
    }
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/** Solid-color PNG with a darker inset panel (synthetic fixture). */
function makePng(width, height, rgb, insetRgb) {
  const [r, g, b] = rgb;
  const [ir, ig, ib] = insetRgb;
  const mx = Math.floor(width * 0.12);
  const my = Math.floor(height * 0.1);
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 3);
    row[0] = 0;
    const inY = y >= my && y < height - my;
    for (let x = 0; x < width; x += 1) {
      const inX = x >= mx && x < width - mx;
      const useInset = inY && inX;
      const i = 1 + x * 3;
      row[i] = useInset ? ir : r;
      row[i + 1] = useInset ? ig : g;
      row[i + 2] = useInset ? ib : b;
    }
    rows.push(row);
  }
  const raw = Buffer.concat(rows);
  const compressed = deflateSync(raw, { level: 9 });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", compressed),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function svg(w, h, body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img">
  <rect width="100%" height="100%" fill="#f4f4f5"/>
  ${body}
</svg>
`;
}

function productSvg(label, accent) {
  return svg(
    800,
    800,
    `
  <rect x="140" y="140" width="520" height="520" rx="48" fill="#ffffff" stroke="#e4e4e7" stroke-width="4"/>
  <rect x="220" y="220" width="360" height="280" rx="28" fill="${accent}"/>
  <rect x="260" y="540" width="280" height="48" rx="12" fill="#d4d4d8"/>
  <text x="400" y="680" text-anchor="middle" font-family="Arial,sans-serif" font-size="28" fill="#52525b">${label}</text>
  <text x="400" y="720" text-anchor="middle" font-family="Arial,sans-serif" font-size="18" fill="#a1a1aa">DEMO · synthetic</text>
`,
  );
}

const products = {
  "screen.svg": productSvg("Display panel", "#93c5fd"),
  "battery.svg": productSvg("Battery pack", "#86efac"),
  "charging-port.svg": productSvg("Charge port", "#fdba74"),
  "camera.svg": productSvg("Camera module", "#c4b5fd"),
  "speaker.svg": productSvg("Speaker", "#f9a8d4"),
  "usb-c-cable.svg": productSvg("USB-C cable", "#67e8f9"),
  "lightning-cable.svg": productSvg("Lightning cable", "#a5b4fc"),
  "charger.svg": productSvg("Wall charger", "#fcd34d"),
  "case.svg": productSvg("Phone case", "#5eead4"),
  "protector.svg": productSvg("Glass protector", "#e2e8f0"),
  "power-bank.svg": productSvg("Power bank", "#fda4af"),
  "cleaning-kit.svg": productSvg("Cleaning kit", "#bef264"),
  "tool.svg": productSvg("Tool kit", "#cbd5e1"),
  "sim-tool.svg": productSvg("SIM tool", "#a8a29e"),
  "generic-part.svg": productSvg("Spare part", "#94a3b8"),
  "mic.svg": productSvg("Microphone flex", "#fca5a5"),
};

const repairDefs = {
  "cracked-front.png": [[244, 244, 245], [254, 202, 202]],
  "device-back.png": [[244, 244, 245], [203, 213, 225]],
  "intake-overview.png": [[244, 244, 245], [191, 219, 254]],
  "charging-port.png": [[244, 244, 245], [253, 186, 116]],
  "device-overview.png": [[244, 244, 245], [165, 180, 252]],
  "liquid-indicator.png": [[244, 244, 245], [134, 239, 172]],
  "exterior-condition.png": [[244, 244, 245], [252, 211, 77]],
  "camera-damage.png": [[244, 244, 245], [196, 181, 253]],
  "before-screen.png": [[244, 244, 245], [252, 165, 165]],
  "after-screen.png": [[244, 244, 245], [134, 239, 172]],
};

const shop = {
  "logo.svg": `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" role="img">
  <rect width="512" height="512" rx="96" fill="#0f172a"/>
  <rect x="128" y="96" width="256" height="320" rx="36" fill="#38bdf8"/>
  <rect x="160" y="128" width="192" height="240" rx="16" fill="#e0f2fe"/>
  <circle cx="256" cy="392" r="14" fill="#0f172a"/>
  <text x="256" y="470" text-anchor="middle" font-family="Arial,sans-serif" font-size="28" fill="#94a3b8">DEMO</text>
</svg>
`,
};

mkdirSync(join(root, "products"), { recursive: true });
mkdirSync(join(root, "repairs"), { recursive: true });
mkdirSync(join(root, "shop"), { recursive: true });

for (const [name, content] of Object.entries(products)) {
  writeFileSync(join(root, "products", name), content);
}
for (const [name, colors] of Object.entries(repairDefs)) {
  writeFileSync(join(root, "repairs", name), makePng(1200, 900, colors[0], colors[1]));
}
for (const [name, content] of Object.entries(shop)) {
  writeFileSync(join(root, "shop", name), content);
}

console.log(
  `Wrote ${Object.keys(products).length} product SVG, ${Object.keys(repairDefs).length} repair PNG, ${Object.keys(shop).length} shop SVG fixtures.`,
);

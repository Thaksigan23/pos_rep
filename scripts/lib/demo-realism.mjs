/**
 * Shared DEMO realism fixtures for MobilePOS.
 * Deterministic fictional Sri Lankan-style demo data — not real PII.
 */

export const DEMO_ORG_NAME = "Demo Mobile Solutions";
export const DEMO_SHOP_NAME = "Demo Mobile Repair";
export const SKU_PREFIX = "DEMO-";
export const BARCODE_PREFIX = "990000";
export const DEMO_EMAIL_DOMAIN = "demo.mobilepos.local";

/** Staff keyed by role — used for auth metadata + profiles. */
export const STAFF_PROFILES = {
  owner: { first: "Ruwan", last: "Jayasuriya" },
  admin: { first: "Tharushi", last: "Fernando" },
  cashier: { first: "Kasun", last: "Silva" },
  technician: { first: "Nimal", last: "Perera" },
};

/**
 * Deterministic customers (email is stable identity).
 * Phones: fictional +94 77 series (7XX XXXX with padded index).
 */
export const CUSTOMER_DEFS = [
  {
    first: "Sajith",
    last: "Wickramasinghe",
    phone: "+94 77 100 1001",
    email: "ava@demo.mobilepos.local",
    devices: [["Apple", "iPhone 14", "Midnight"]],
  },
  {
    first: "Nadeesha",
    last: "Gunasekara",
    phone: "+94 77 100 1002",
    email: "ben@demo.mobilepos.local",
    devices: [
      ["Samsung", "Galaxy S23", "Black"],
      ["Google", "Pixel 7", "Snow"],
    ],
  },
  {
    first: "Isuru",
    last: "Bandara",
    phone: "+94 77 100 1003",
    email: "cara@demo.mobilepos.local",
    devices: [["Apple", "iPhone 13", "Blue"]],
  },
  {
    first: "Fathima",
    last: "Rizwan",
    phone: "+94 77 100 1004",
    email: "diego@demo.mobilepos.local",
    devices: [["Xiaomi", "Redmi Note 12", "Green"]],
  },
  {
    first: "Chamari",
    last: "Dissanayake",
    phone: "+94 77 100 1005",
    email: "elena@demo.mobilepos.local",
    devices: [
      ["OnePlus", "Nord CE 3", "Grey"],
      ["Apple", "iPhone 15", "Pink"],
    ],
  },
  {
    first: "Ahamed",
    last: "Farook",
    phone: "+94 77 100 1006",
    email: "finn@demo.mobilepos.local",
    devices: [["Google", "Pixel 8", "Obsidian"]],
  },
  {
    first: "Dilini",
    last: "Rathnayake",
    phone: "+94 77 100 1007",
    email: "gina@demo.mobilepos.local",
    devices: [["Samsung", "Galaxy A54", "Violet"]],
  },
  {
    first: "Pradeep",
    last: "Kumara",
    phone: "+94 77 100 1008",
    email: "hugo@demo.mobilepos.local",
    devices: [["Apple", "iPhone 14", "Starlight"]],
  },
  {
    first: "Harshani",
    last: "Mendis",
    phone: "+94 77 100 1009",
    email: "ivy@demo.mobilepos.local",
    devices: [],
  },
  {
    first: "Lakshan",
    last: "Perera",
    phone: "+94 77 100 1010",
    email: "jake@demo.mobilepos.local",
    devices: [["Samsung", "Galaxy S23", "Cream"]],
  },
  {
    first: "Amaya",
    last: "Senanayake",
    phone: "+94 77 100 1011",
    email: "kara@demo.mobilepos.local",
    devices: [
      ["Apple", "iPhone 15", "Black"],
      ["Google", "Pixel 7", "Lemongrass"],
    ],
  },
  {
    first: "Roshan",
    last: "Abeysekara",
    phone: "+94 77 100 1012",
    email: "leo@demo.mobilepos.local",
    devices: [["Xiaomi", "Redmi Note 12", "Blue"]],
  },
  {
    first: "Thilini",
    last: "Jayawardena",
    phone: "+94 77 100 1013",
    email: "mira@demo.mobilepos.local",
    devices: [["OnePlus", "Nord CE 3", "Aqua"]],
  },
  {
    first: "Mahesh",
    last: "Fonseka",
    phone: "+94 77 100 1014",
    email: "ned@demo.mobilepos.local",
    devices: [],
  },
  {
    first: "Sanduni",
    last: "Weerasinghe",
    phone: "+94 77 100 1015",
    email: "olive@demo.mobilepos.local",
    devices: [["Apple", "iPhone 13", "Red"]],
  },
  {
    first: "Nuwan",
    last: "Herath",
    phone: "+94 77 100 1016",
    email: "pete@demo.mobilepos.local",
    devices: [["Google", "Pixel 8", "Hazel"]],
  },
];

/** LKR demo catalog prices (fictional bands). */
export const PRODUCT_PRICE_OVERRIDES = {
  "SCR-IP13": { price: 28500, cost: 16200 },
  "SCR-IP14": { price: 32500, cost: 18800 },
  "SCR-IP15": { price: 38500, cost: 22000 },
  "SCR-S23": { price: 24500, cost: 13800 },
  "SCR-PXL7": { price: 19800, cost: 11200 },
  "SCR-A54": { price: 16500, cost: 9200 },
  "BAT-IP13": { price: 8500, cost: 4200 },
  "BAT-IP15": { price: 9800, cost: 4800 },
  "BAT-S23": { price: 7200, cost: 3500 },
  "BAT-PXL": { price: 7800, cost: 3800 },
  "CHG-IP": { price: 5500, cost: 2400 },
  "CHG-USB": { price: 4800, cost: 2100 },
  "CAM-IP14": { price: 14500, cost: 7800 },
  "CAM-PXL8": { price: 12800, cost: 6900 },
  "SPK-IP": { price: 4200, cost: 1800 },
  "SPK-AND": { price: 3500, cost: 1400 },
  "CBL-USBC": { price: 2200, cost: 750 },
  "CBL-USBC-3": { price: 3200, cost: 1100 },
  "CBL-LTN": { price: 2500, cost: 850 },
  "CHG-20W": { price: 4500, cost: 1800 },
  "CHG-30W": { price: 6500, cost: 2600 },
  "CSE-IP14": { price: 2800, cost: 950 },
  "CSE-S23": { price: 3500, cost: 1200 },
  "CSE-PXL": { price: 2400, cost: 800 },
  "GLS-IP15": { price: 1800, cost: 450 },
  "GLS-UNI": { price: 1200, cost: 350 },
  "PB-10K": { price: 7500, cost: 3800 },
  "PB-20K": { price: 11500, cost: 5800 },
  "KIT-CLN": { price: 1500, cost: 450 },
  "TOL-SIM": { price: 500, cost: 120 },
  "KIT-OPEN": { price: 4500, cost: 1800 },
  "MIC-IP": { price: 2800, cost: 1100 },
};

/** LKR demo repair service labor defaults. */
export const SERVICE_LABOR_OVERRIDES = {
  "Screen replacement": { labor: 5500, warranty: 30 },
  "Battery replacement": { labor: 3500, warranty: 90 },
  "Charging port repair": { labor: 4500, warranty: 30 },
  "Camera replacement": { labor: 5000, warranty: 30 },
  "Speaker repair": { labor: 3000, warranty: 30 },
  "Diagnostic service": { labor: 2000, warranty: 0 },
  "Software troubleshooting": { labor: 2500, warranty: 7 },
  "Water-damage inspection": { labor: 6500, warranty: 0 },
};

/**
 * Synthetic 15-digit IMEI-like string (string math only).
 * TAC 990000 is a fictional test range — not a real device.
 */
export function syntheticImei(n) {
  const seq = String(Math.max(1, Number(n) || 1)).padStart(8, "0").slice(-8);
  const body = `${BARCODE_PREFIX}${seq}`; // 6 + 8 = 14 digits
  if (!/^\d{14}$/.test(body)) {
    throw new Error(`IMEI body must be 14 digits, got: ${body}`);
  }
  let sum = 0;
  for (let i = 0; i < 14; i += 1) {
    let d = Number(body[i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  const check = (10 - (sum % 10)) % 10;
  return `${body}${check}`;
}

export function syntheticSerial(n) {
  return `DEMO-SN-${String(Math.max(1, Number(n) || 1)).padStart(6, "0")}`;
}

export function barcode(n) {
  return `${BARCODE_PREFIX}${String(n).padStart(7, "0")}`;
}

/** Photo-set markers stored in internal_notes (not customer-facing). */
export const PHOTO_SET_MARKERS = {
  cracked: "DEMO_PHOTO_SET:cracked",
  charging: "DEMO_PHOTO_SET:charging",
  liquid: "DEMO_PHOTO_SET:liquid",
  camera: "DEMO_PHOTO_SET:camera",
  before_after: "DEMO_PHOTO_SET:before_after",
};

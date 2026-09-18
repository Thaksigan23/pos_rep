/**
 * Phase 10 controlled inventory ledger walk:
 * start 5 → sell 2 (3) → refund restock 1 (4) → sell 1 (3) → refund damaged 1 (3)
 * Never prints secrets.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    }),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anon || !service) throw new Error("Missing Supabase env in .env.local");

const stamp = Date.now();
const password = "Phase10-Inv-Passw0rd!";
const results = [];

function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const admin = createClient(url, service, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function signIn(email) {
  const sb = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`sign-in failed: ${error?.message}`);
  return sb;
}

async function createAuthUser(email, firstName) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { first_name: firstName },
  });
  if (error) throw new Error(`createUser: ${error.message}`);
  return data.user;
}

async function stockQty(sb, productId, shopId) {
  const { data } = await sb
    .from("product_stocks")
    .select("quantity")
    .eq("product_id", productId)
    .eq("shop_id", shopId)
    .maybeSingle();
  return data ? Number(data.quantity) : null;
}

async function main() {
  const ownerUser = await createAuthUser(`phase10.owner.${stamp}@example.com`, "P10Owner");
  const adminUser = await createAuthUser(`phase10.admin.${stamp}@example.com`, "P10Admin");
  const cashierUser = await createAuthUser(`phase10.cashier.${stamp}@example.com`, "P10Cashier");

  const owner = await signIn(ownerUser.email);
  const boot = await owner.rpc("bootstrap_organization", {
    p_name: `Phase10 Inv Org ${stamp}`,
  });
  if (boot.error) throw new Error(boot.error.message);

  const { data: shop } = await owner.from("shops").select("id, organization_id").single();
  const { data: org } = await owner.from("organizations").select("id").single();

  for (const [user, role] of [
    [adminUser, "admin"],
    [cashierUser, "cashier"],
  ]) {
    const assigned = await owner.rpc("assign_staff_profile", {
      p_user_id: user.id,
      p_role: role,
      p_shop_id: shop.id,
      p_first_name: role,
    });
    if (assigned.error) throw new Error(assigned.error.message);
  }

  const adminSb = await signIn(adminUser.email);
  const cashier = await signIn(cashierUser.email);

  const { data: supplier } = await owner
    .from("suppliers")
    .insert({ name: `P10 Supplier ${stamp}` })
    .select("id")
    .single();
  const { data: product } = await owner
    .from("products")
    .insert({
      sku: `P10-${stamp}`,
      name: "Phase10 Sanity Part",
      product_type: "spare_part",
      selling_price: 50,
      track_inventory: true,
      organization_id: org.id,
    })
    .select("id")
    .single();
  await owner.from("product_costs").insert({ product_id: product.id, cost_price: 20 });

  const purchase = await owner.rpc("create_purchase", {
    p_payload: {
      supplier_id: supplier.id,
      items: [{ product_id: product.id, quantity_ordered: 5, unit_cost: 20 }],
    },
  });
  record("purchase created", !purchase.error, purchase.error?.message);

  const { data: purchaseItems } = await owner
    .from("purchase_items")
    .select("id")
    .eq("purchase_id", purchase.data);
  const purchaseItemId = purchaseItems?.[0]?.id;

  const received = await owner.rpc("receive_purchase", {
    p_payload: {
      purchase_id: purchase.data,
      items: [{ purchase_item_id: purchaseItemId, quantity: 5 }],
    },
  });
  record("purchase received (stock=5)", !received.error, received.error?.message);
  record("authoritative stock after receive = 5", (await stockQty(owner, product.id, shop.id)) === 5);

  const sale1 = await cashier.rpc("complete_sale", {
    p_payload: {
      items: [{ product_id: product.id, quantity: 2 }],
      payments: [{ method: "cash", tendered_amount: 100 }],
      idempotency_key: crypto.randomUUID(),
    },
  });
  record("sell 2", !sale1.error, sale1.error?.message);
  record("stock after sell 2 = 3", (await stockQty(owner, product.id, shop.id)) === 3);

  const { data: sale1Items } = await cashier
    .from("sale_items")
    .select("id")
    .eq("sale_id", sale1.data);

  const restockRefund = await adminSb.rpc("refund_sale", {
    p_payload: {
      sale_id: sale1.data,
      reason: "Phase10 restock refund",
      method: "cash",
      items: [
        {
          sale_item_id: sale1Items?.[0]?.id,
          quantity: 1,
          restock_disposition: "restock",
        },
      ],
      idempotency_key: crypto.randomUUID(),
    },
  });
  record("refund 1 RESTOCK", !restockRefund.error, restockRefund.error?.message);
  record("stock after restock refund = 4", (await stockQty(owner, product.id, shop.id)) === 4);

  const sale2 = await cashier.rpc("complete_sale", {
    p_payload: {
      items: [{ product_id: product.id, quantity: 1 }],
      payments: [{ method: "card", amount: 50 }],
      idempotency_key: crypto.randomUUID(),
    },
  });
  record("sell 1", !sale2.error, sale2.error?.message);
  record("stock after sell 1 = 3", (await stockQty(owner, product.id, shop.id)) === 3);

  const { data: sale2Items } = await cashier
    .from("sale_items")
    .select("id")
    .eq("sale_id", sale2.data);

  const damagedRefund = await adminSb.rpc("refund_sale", {
    p_payload: {
      sale_id: sale2.data,
      reason: "Phase10 damaged refund",
      method: "card",
      items: [
        {
          sale_item_id: sale2Items?.[0]?.id,
          quantity: 1,
          restock_disposition: "damaged",
        },
      ],
      idempotency_key: crypto.randomUUID(),
    },
  });
  record("refund 1 DAMAGED", !damagedRefund.error, damagedRefund.error?.message);
  record(
    "sellable stock remains 3 after damaged refund",
    (await stockQty(owner, product.id, shop.id)) === 3,
  );

  const { data: movements, error: movErr } = await owner
    .from("inventory_movements")
    .select("movement_type, quantity_change, reference_type")
    .eq("product_id", product.id)
    .eq("shop_id", shop.id)
    .order("created_at", { ascending: true });

  const types = (movements || []).map((m) => `${m.movement_type}:${m.quantity_change}`);
  const expectedNet = (movements || []).reduce((s, m) => s + Number(m.quantity_change), 0);
  record(
    "ledger explains every change (net qty = 3)",
    !movErr && expectedNet === 3 && (movements || []).length >= 5,
    movErr?.message || types.join(" | "),
  );

  const hasPurchaseIn = (movements || []).some(
    (m) => Number(m.quantity_change) === 5 && m.movement_type === "purchase",
  );
  const hasSaleOut = (movements || []).filter(
    (m) => m.movement_type === "sale" && Number(m.quantity_change) < 0,
  ).length >= 2;
  const hasRestockIn = (movements || []).some(
    (m) => m.movement_type === "customer_return" && Number(m.quantity_change) > 0,
  );
  const hasDamaged = (movements || []).some(
    (m) => m.movement_type === "damaged" && Number(m.quantity_change) < 0,
  );
  record("ledger includes purchase inbound", hasPurchaseIn, types.join(","));
  record("ledger includes sale outbound", hasSaleOut, types.join(","));
  record("ledger includes restock inbound", hasRestockIn, types.join(","));
  record("ledger includes damaged write-off", hasDamaged, types.join(","));

  const { data: payments } = await owner
    .from("payments")
    .select("entry_type, amount, method, voided_at, reference_id")
    .in("reference_id", [sale1.data, sale2.data].filter(Boolean));

  const receipts = (payments || []).filter((p) => p.entry_type === "receipt" && !p.voided_at);
  const refunds = (payments || []).filter((p) => p.entry_type === "refund" && !p.voided_at);
  record(
    "payment/refund history preserved",
    receipts.length >= 2 && refunds.length >= 2,
    `receipts=${receipts.length} refunds=${refunds.length}`,
  );

  const cashierCosts = await cashier.from("product_costs").select("cost_price");
  record(
    "cashier cannot read product_costs",
    !cashierCosts.data?.length,
    cashierCosts.error?.message || `rows=${cashierCosts.data?.length ?? 0}`,
  );

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} inventory sanity checks passed`);
  if (failed.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error("FATAL", err.message || err);
  process.exit(1);
});

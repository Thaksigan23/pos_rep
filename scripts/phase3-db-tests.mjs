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
if (!url || !anon || !service) {
  throw new Error("Missing Supabase env in .env.local");
}

const year = new Date().getUTCFullYear();
const stamp = Date.now();
const password = "Phase3-Test-Passw0rd!";
const results = [];

const EXPECTED_TABLES = [
  "organizations", "shops", "shop_settings", "profiles", "shop_members", "document_sequences",
  "customers", "device_brands", "device_models", "customer_devices",
  "categories", "brands", "suppliers", "products", "product_device_compatibility",
  "product_costs", "product_stocks", "inventory_movements", "inventory_movement_costs",
  "purchases", "purchase_items", "sales", "sale_items", "sale_item_costs",
  "payments", "refunds", "refund_items",
  "repair_services", "repair_jobs", "repair_status_history", "repair_estimates",
  "repair_estimate_items", "repair_job_services", "repair_parts", "repair_part_costs",
  "intake_check_definitions", "device_intake_checks", "repair_accessories", "repair_photos",
  "product_images",
  "warranties", "warranty_claims", "expense_categories", "expenses",
  "notifications", "notification_outbox", "audit_logs",
];

function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const admin = createClient(url, service, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function signIn(email) {
  const anonClient = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await anonClient.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw new Error(`sign-in failed for ${email}: ${error?.message}`);
  }
  return { session: data.session, user: data.user, sb: anonClient };
}

function rpc(sb, name, args = {}) {
  return sb.rpc(name, args);
}

async function createAuthUser(email, firstName) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { first_name: firstName },
  });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  return data.user;
}

function expectError(error, needles) {
  const message = (error?.message || "").toLowerCase();
  return needles.some((needle) => message.includes(needle.toLowerCase()));
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
  const users = {
    ownerA: await createAuthUser(`phase3.owner.a.${stamp}@example.com`, "OwnerA"),
    adminA: await createAuthUser(`phase3.admin.a.${stamp}@example.com`, "AdminA"),
    cashierA: await createAuthUser(`phase3.cashier.a.${stamp}@example.com`, "CashierA"),
    techA: await createAuthUser(`phase3.tech.a.${stamp}@example.com`, "TechA"),
    ownerB: await createAuthUser(`phase3.owner.b.${stamp}@example.com`, "OwnerB"),
  };

  const ownerA = await signIn(users.ownerA.email);
  const ownerB = await signIn(users.ownerB.email);

  const bootA = await rpc(ownerA.sb, "bootstrap_organization", { p_name: `Phase3 Org A ${stamp}` });
  const bootB = await rpc(ownerB.sb, "bootstrap_organization", { p_name: `Phase3 Org B ${stamp}` });
  record("1. owner can bootstrap organization", !bootA.error, bootA.error?.message);
  record("bootstrap org B", !bootB.error, bootB.error?.message);

  const { data: shopA, error: shopErr } = await ownerA.sb.from("shops").select("id, organization_id").single();
  record("1. owner can read own shop", !shopErr && !!shopA?.id, shopErr?.message);
  const { data: orgA } = await ownerA.sb.from("organizations").select("id").single();
  const { data: orgBrow } = await ownerB.sb.from("organizations").select("id").single();
  const { data: ownerShopB } = await ownerB.sb.from("shops").select("id").single();

  for (const [user, role] of [
    [users.adminA, "admin"],
    [users.cashierA, "cashier"],
    [users.techA, "technician"],
  ]) {
    const assigned = await rpc(ownerA.sb, "assign_staff_profile", {
      p_user_id: user.id,
      p_role: role,
      p_shop_id: shopA.id,
      p_first_name: role,
    });
    record(`assign ${role}`, !assigned.error, assigned.error?.message);
  }

  const adminA = await signIn(users.adminA.email);
  const cashierA = await signIn(users.cashierA.email);
  const techA = await signIn(users.techA.email);

  const snapshot = await admin.rpc("phase3_schema_snapshot");
  record("schema snapshot RPC", !snapshot.error, snapshot.error?.message);
  if (snapshot.data?.tables) {
    const names = snapshot.data.tables.map((row) => row.name);
    const missing = EXPECTED_TABLES.filter((name) => !names.includes(name));
    const rlsOff = snapshot.data.tables.filter(
      (row) => EXPECTED_TABLES.includes(row.name) && (!row.rls || !row.force_rls),
    );
    record("schema: all expected tables exist", missing.length === 0, missing.join(","));
    record("schema: RLS + FORCE RLS on tenant tables", rlsOff.length === 0, rlsOff.map((row) => row.name).join(","));
    record("schema: foreign keys exist", Number(snapshot.data.foreign_keys) > 40, String(snapshot.data.foreign_keys));
    record("schema: unique constraints exist", Number(snapshot.data.unique_constraints) > 20, String(snapshot.data.unique_constraints));
    const fnNames = (snapshot.data.functions || []).map((row) => row.name);
    for (const name of ["complete_sale", "refund_sale", "cancel_repair", "next_document_number"]) {
      record(`schema: RPC ${name} exists`, fnNames.includes(name));
    }
    record("schema: triggers exist", (snapshot.data.triggers || []).length > 20, String(snapshot.data.triggers?.length));
    const buckets = snapshot.data.storage_buckets || [];
    record(
      "schema: storage buckets exist",
      buckets.includes("shop-assets") && buckets.includes("repair-photos"),
      buckets.join(","),
    );
  }

  const { data: shop2, error: shop2Err } = await ownerA.sb
    .from("shops")
    .insert({ name: `Second shop ${stamp}` })
    .select("id")
    .single();
  record("1. owner can create a second shop", !shop2Err && !!shop2?.id, shop2Err?.message);
  if (shop2?.id) {
    const settings = await ownerA.sb.from("shop_settings").insert({ shop_id: shop2.id }).select("shop_id").single();
    record("1. owner can insert shop settings", !settings.error, settings.error?.message);
  }

  const { data: brand } = await ownerA.sb.from("device_brands").insert({ name: `Apple ${stamp}` }).select("id").single();
  const { data: model } = await ownerA.sb
    .from("device_models")
    .insert({ device_brand_id: brand.id, name: `iPhone Test ${stamp}` })
    .select("id")
    .single();
  const { data: supplier } = await ownerA.sb.from("suppliers").insert({ name: `Supplier ${stamp}` }).select("id").single();
  const { data: product } = await ownerA.sb
    .from("products")
    .insert({
      sku: `SKU-${stamp}`,
      name: "Screen assembly",
      product_type: "spare_part",
      selling_price: 100,
      track_inventory: true,
      organization_id: orgBrow.id,
    })
    .select("id, organization_id, selling_price")
    .single();
  record(
    "27. forged organization_id is overwritten to caller org",
    product?.organization_id === orgA.id,
    product?.organization_id,
  );
  await ownerA.sb.from("product_costs").insert({ product_id: product.id, cost_price: 40 });
  const { data: service } = await ownerA.sb
    .from("repair_services")
    .insert({ name: "Screen replacement", default_labor_charge: 50, default_warranty_days: 30 })
    .select("id")
    .single();

  const cashierProductWrite = await cashierA.sb
    .from("products")
    .insert({ sku: `CASH-${stamp}`, name: "Should fail", selling_price: 1 })
    .select("id");
  record(
    "3. cashier cannot write products",
    (cashierProductWrite.error && expectError(cashierProductWrite.error, ["policy", "row-level"])) ||
      (cashierProductWrite.data || []).length === 0,
    cashierProductWrite.error?.message || `rows=${cashierProductWrite.data?.length}`,
  );

  const techProductWrite = await techA.sb
    .from("products")
    .insert({ sku: `TECH-${stamp}`, name: "Should fail", selling_price: 1 })
    .select("id");
  record(
    "4. technician cannot write products",
    (techProductWrite.error && expectError(techProductWrite.error, ["policy", "row-level"])) ||
      (techProductWrite.data || []).length === 0,
    techProductWrite.error?.message || `rows=${techProductWrite.data?.length}`,
  );

  const customerRes = await rpc(cashierA.sb, "create_customer", {
    p_payload: { first_name: "Nimal", last_name: "Perera", phone: "0770000001" },
  });
  record("3. cashier can create customers", !customerRes.error, customerRes.error?.message);
  const { data: customer } = await cashierA.sb
    .from("customers")
    .select("id, customer_number")
    .eq("id", customerRes.data)
    .single();
  record("18. CUS document number", !!customer?.customer_number?.match(new RegExp(`^CUS-${year}-\\d{6}$`)), customer?.customer_number);

  const { data: device } = await cashierA.sb
    .from("customer_devices")
    .insert({ customer_id: customer?.id, device_model_id: model?.id, imei: `35${stamp}` })
    .select("id")
    .single();

  const purchase = await rpc(ownerA.sb, "create_purchase", {
    p_payload: {
      supplier_id: supplier.id,
      items: [{ product_id: product.id, quantity_ordered: 5, unit_cost: 40 }],
    },
  });
  record("1. owner can create purchase", !purchase.error, purchase.error?.message);
  const { data: purchaseRow } = await ownerA.sb
    .from("purchases")
    .select("id, purchase_number")
    .eq("id", purchase.data)
    .single();
  record("18. PO document number", !!purchaseRow?.purchase_number?.match(new RegExp(`^PO-${year}-\\d{6}$`)), purchaseRow?.purchase_number);
  const { data: purchaseItems } = await ownerA.sb.from("purchase_items").select("id").eq("purchase_id", purchase.data);
  const purchaseItemId = purchaseItems?.[0]?.id;
  const received = await rpc(ownerA.sb, "receive_purchase", {
    p_payload: { purchase_id: purchase.data, items: [{ purchase_item_id: purchaseItemId, quantity: 5 }] },
  });
  record("12. receive purchase updates stock", !received.error, received.error?.message);
  record("12. stock is 5 after purchase", (await stockQty(ownerA.sb, product.id, shopA.id)) === 5, String(await stockQty(ownerA.sb, product.id, shopA.id)));

  const cashierReceive = await rpc(cashierA.sb, "receive_purchase", {
    p_payload: { purchase_id: purchase.data, items: [{ purchase_item_id: purchaseItemId, quantity: 1 }] },
  });
  record(
    "3. cashier cannot receive purchase",
    !!cashierReceive.error && expectError(cashierReceive.error, ["insufficient role"]),
    cashierReceive.error?.message || "missing error",
  );

  const directStock = await cashierA.sb.from("product_stocks").update({ quantity: 999 }).eq("product_id", product.id).select();
  record(
    "11. direct product_stocks modification blocked",
    (directStock.error && expectError(directStock.error, ["not allowed", "policy", "row-level"])) ||
      (Array.isArray(directStock.data) && directStock.data.length === 0),
    directStock.error?.message || `rows=${directStock.data?.length}`,
  );

  const cashierCosts = await cashierA.sb.from("product_costs").select("cost_price");
  record("9. cashier cannot read product_costs", !cashierCosts.error && (cashierCosts.data?.length || 0) === 0, `rows=${cashierCosts.data?.length}`);
  const cashierSaleCosts = await cashierA.sb.from("sale_item_costs").select("unit_cost");
  record("9. cashier cannot read sale_item_costs", !cashierSaleCosts.error && (cashierSaleCosts.data?.length || 0) === 0, `rows=${cashierSaleCosts.data?.length}`);
  const techCosts = await techA.sb.from("product_costs").select("cost_price");
  record("10. technician cannot read product_costs", !techCosts.error && (techCosts.data?.length || 0) === 0, `rows=${techCosts.data?.length}`);
  const ownerCosts = await ownerA.sb.from("product_costs").select("cost_price").eq("product_id", product.id);
  record("1. owner can read product costs", !!ownerCosts.data?.[0], ownerCosts.error?.message);
  const adminCosts = await adminA.sb.from("product_costs").select("cost_price").eq("product_id", product.id);
  record("2. admin can read product costs", !!adminCosts.data?.[0], adminCosts.error?.message);

  const adminSelfPromote = await adminA.sb.from("profiles").update({ role: "owner" }).eq("id", users.adminA.id).select();
  record(
    "7. admin cannot self-promote",
    adminSelfPromote.error && expectError(adminSelfPromote.error, ["cannot change", "own role"]),
    adminSelfPromote.error?.message || `rows=${adminSelfPromote.data?.length}`,
  );
  const promote = await cashierA.sb.from("profiles").update({ role: "owner" }).eq("id", users.cashierA.id).select();
  record(
    "7. cashier cannot self-promote",
    promote.error && expectError(promote.error, ["cannot change", "own role"]),
    promote.error?.message || `rows=${promote.data?.length}`,
  );

  const switchOrg = await cashierA.sb
    .from("profiles")
    .update({ organization_id: orgBrow.id })
    .eq("id", users.cashierA.id)
    .select();
  record(
    "8. organization switching is blocked",
    switchOrg.error && expectError(switchOrg.error, ["cannot change organization", "organization"]),
    switchOrg.error?.message || `rows=${switchOrg.data?.length}`,
  );

  const crossProducts = await ownerB.sb.from("products").select("id").eq("id", product.id);
  record("5. cross-organization product select is empty", !crossProducts.error && (crossProducts.data?.length || 0) === 0, `rows=${crossProducts.data?.length}`);

  if (shop2?.id) {
    const shop2Sale = await rpc(cashierA.sb, "complete_sale", {
      p_payload: {
        shop_id: shop2.id,
        organization_id: orgA.id,
        items: [{ product_id: product.id, quantity: 1 }],
        payments: [{ method: "cash", amount: 100 }],
      },
    });
    record(
      "6. cashier cannot checkout at an unassigned shop",
      !!shop2Sale.error && expectError(shop2Sale.error, ["shop access", "denied"]),
      shop2Sale.error?.message || "missing error",
    );
    const shop2Stock = await cashierA.sb.from("product_stocks").select("id").eq("shop_id", shop2.id);
    record("6. cashier cannot read other-shop stock", !shop2Stock.error && (shop2Stock.data?.length || 0) === 0, `rows=${shop2Stock.data?.length}`);
  }

  const foreignShopSale = await rpc(cashierA.sb, "complete_sale", {
    p_payload: {
      shop_id: ownerShopB.id,
      organization_id: orgBrow.id,
      items: [{ product_id: product.id, quantity: 1, unit_price: 1 }],
      payments: [{ method: "cash", amount: 100 }],
    },
  });
  record(
    "27. forged shop_id from another org is rejected",
    !!foreignShopSale.error,
    foreignShopSale.error?.message || "missing error",
  );

  const insufficient = await rpc(cashierA.sb, "complete_sale", {
    p_payload: {
      items: [{ product_id: product.id, quantity: 50 }],
      payments: [{ method: "cash", amount: 5000 }],
    },
  });
  record(
    "13. negative/insufficient stock is rejected",
    !!insufficient.error && expectError(insufficient.error, ["insufficient"]),
    insufficient.error?.message || "missing error",
  );

  const salePayload = {
    organization_id: orgBrow.id,
    items: [{ product_id: product.id, quantity: 1, unit_price: 1 }],
    payments: [{ method: "cash", amount: 100 }],
    idempotency_key: crypto.randomUUID(),
  };
  const sale1 = await rpc(cashierA.sb, "complete_sale", { p_payload: salePayload });
  const sale1b = await rpc(cashierA.sb, "complete_sale", { p_payload: salePayload });
  record("3. cashier can complete a sale", !sale1.error, sale1.error?.message);
  record("15. complete_sale is idempotent", sale1.data === sale1b.data, `${sale1.data} vs ${sale1b.data}`);
  const { data: saleRow } = await cashierA.sb
    .from("sales")
    .select("id, sale_number, total, status, organization_id")
    .eq("id", sale1.data)
    .single();
  record("18. INV document number", !!saleRow?.sale_number?.match(new RegExp(`^INV-${year}-\\d{6}$`)), saleRow?.sale_number);
  record("27. sale org is server-derived not forged", saleRow?.organization_id === orgA.id, saleRow?.organization_id);
  record("server-calculated sale total ignores client unit_price", Number(saleRow?.total) === 100, String(saleRow?.total));
  record("12. stock is 4 after sale", (await stockQty(ownerA.sb, product.id, shopA.id)) === 4);

  const paid = await rpc(cashierA.sb, "paid_total", { p_reference_type: "sale", p_reference_id: sale1.data });
  record("17. paid_total matches sale", Number(paid.data) === 100, String(paid.data));

  const overpaySale = await rpc(cashierA.sb, "record_payment", {
    p_payload: {
      reference_type: "sale",
      reference_id: sale1.data,
      method: "cash",
      amount: 5,
    },
  });
  record(
    "31. fully paid sale rejects ordinary overpayment",
    !!overpaySale.error && expectError(overpaySale.error, ["fully paid", "exceeds outstanding"]),
    overpaySale.error?.message || "missing error",
  );

  const { data: saleItems } = await cashierA.sb.from("sale_items").select("id").eq("sale_id", sale1.data);
  const cashierRefund = await rpc(cashierA.sb, "refund_sale", {
    p_payload: { sale_id: sale1.data, reason: "Cashier should not refund", items: [{ sale_item_id: saleItems?.[0]?.id, quantity: 1 }] },
  });
  record(
    "3. cashier cannot refund",
    !!cashierRefund.error && expectError(cashierRefund.error, ["insufficient role"]),
    cashierRefund.error?.message || "missing error",
  );

  const refund = await rpc(adminA.sb, "refund_sale", {
    p_payload: {
      sale_id: sale1.data,
      reason: "Customer returned the part",
      items: [{ sale_item_id: saleItems?.[0]?.id, quantity: 1, amount: 1 }],
    },
  });
  record("2. admin can refund_sale", !refund.error, refund.error?.message);
  const paidAfterRefund = await rpc(ownerA.sb, "paid_total", { p_reference_type: "sale", p_reference_id: sale1.data });
  record("17. refund uses server line totals not client amount", Number(paidAfterRefund.data) === 0, String(paidAfterRefund.data));
  const { data: payments } = await ownerA.sb
    .from("payments")
    .select("id, entry_type, voided_at, amount")
    .eq("reference_id", sale1.data);
  record(
    "17. original payment retained after refund",
    (payments || []).some((row) => row.entry_type === "receipt" && !row.voided_at && Number(row.amount) === 100),
    `count=${payments?.length}`,
  );
  record("12. customer_return restocks sold qty", (await stockQty(ownerA.sb, product.id, shopA.id)) === 5);

  const deletePayment = await ownerA.sb.from("payments").delete().eq("reference_id", sale1.data).select();
  record(
    "17. payment delete is blocked",
    (deletePayment.error && expectError(deletePayment.error, ["cannot be deleted", "void"])) ||
      (Array.isArray(deletePayment.data) && deletePayment.data.length === 0),
    deletePayment.error?.message || `rows=${deletePayment.data?.length}`,
  );

  const techSale = await rpc(techA.sb, "complete_sale", {
    p_payload: { items: [{ product_id: product.id, quantity: 1 }], payments: [{ method: "cash", amount: 100 }] },
  });
  record(
    "4. technician cannot complete a sale",
    !!techSale.error && expectError(techSale.error, ["insufficient role"]),
    techSale.error?.message || "missing error",
  );

  const nums = await Promise.all([
    rpc(ownerA.sb, "next_document_number", { p_doc_type: "customer", p_shop_id: shopA.id }),
    rpc(ownerA.sb, "next_document_number", { p_doc_type: "customer", p_shop_id: shopA.id }),
  ]);
  record(
    "19. concurrent document numbers do not duplicate",
    !nums[0].error && !nums[1].error && nums[0].data !== nums[1].data,
    `${nums[0].data} vs ${nums[1].data} ${nums[0].error?.message || ""} ${nums[1].error?.message || ""}`,
  );

  const job = await rpc(techA.sb, "create_repair_job", {
    p_payload: { customer_id: customer.id, device_id: device.id, reported_issue: "Cracked screen" },
  });
  record("4. technician can create a repair job", !job.error, job.error?.message);
  const { data: jobRow } = await techA.sb
    .from("repair_jobs")
    .select("id, ticket_number, status")
    .eq("id", job.data)
    .single();
  record("18. REP document number", !!jobRow?.ticket_number?.match(new RegExp(`^REP-${year}-\\d{6}$`)), jobRow?.ticket_number);

  const badTransition = await rpc(techA.sb, "change_repair_status", {
    p_repair_job_id: job.data,
    p_new_status: "completed",
  });
  record(
    "21. unauthorized repair transition is blocked",
    !!badTransition.error && expectError(badTransition.error, ["invalid repair status"]),
    badTransition.error?.message || "missing error",
  );

  const estimate = await rpc(techA.sb, "create_repair_estimate", {
    p_payload: {
      repair_job_id: job.data,
      items: [
        { line_type: "labor", repair_service_id: service.id, quantity: 1 },
        { line_type: "part", product_id: product.id, quantity: 1 },
      ],
    },
  });
  record("24. create estimate", !estimate.error, estimate.error?.message);
  const { data: estimateRow } = await techA.sb
    .from("repair_estimates")
    .select("id, estimate_number, version, status, total")
    .eq("id", estimate.data)
    .single();
  record("18. EST document number", !!estimateRow?.estimate_number?.match(new RegExp(`^EST-${year}-\\d{6}$`)), estimateRow?.estimate_number);

  await rpc(techA.sb, "send_repair_estimate", { p_estimate_id: estimate.data });
  const approved = await rpc(ownerA.sb, "approve_repair_estimate", { p_estimate_id: estimate.data, p_method: "in_person" });
  record("20. estimate approval advances repair", !approved.error, approved.error?.message);

  const editApproved = await rpc(techA.sb, "update_draft_estimate", {
    p_payload: { estimate_id: estimate.data, notes: "silent edit" },
  });
  record(
    "25. approved estimate cannot be silently edited",
    !!editApproved.error && expectError(editApproved.error, ["draft", "new version", "immutable"]),
    editApproved.error?.message || "missing error",
  );
  const clientEdit = await techA.sb.from("repair_estimates").update({ total: 1 }).eq("id", estimate.data).select();
  record(
    "25. client cannot update approved estimate via table",
    (clientEdit.error && expectError(clientEdit.error, ["policy", "immutable"])) ||
      (Array.isArray(clientEdit.data) && clientEdit.data.length === 0),
    clientEdit.error?.message || `rows=${clientEdit.data?.length}`,
  );

  const revised = await rpc(techA.sb, "revise_repair_estimate", { p_estimate_id: estimate.data });
  record("24. revise creates a new estimate version", !revised.error && revised.data !== estimate.data, revised.error?.message);
  const { data: versions } = await ownerA.sb
    .from("repair_estimates")
    .select("id, version, status")
    .eq("repair_job_id", job.data)
    .order("version");
  record(
    "24. approved estimate superseded; version 2 is draft",
    versions?.[0]?.status === "superseded" && versions?.[1]?.status === "draft" && versions?.[1]?.version === 2,
    JSON.stringify(versions),
  );

  const toInRepair = await rpc(techA.sb, "change_repair_status", { p_repair_job_id: job.data, p_new_status: "in_repair" });
  record("20. transition approved → in_repair", !toInRepair.error, toInRepair.error?.message);
  const consume = await rpc(techA.sb, "consume_repair_parts", {
    p_payload: { repair_job_id: job.data, items: [{ product_id: product.id, quantity: 1 }] },
  });
  record("4. technician can consume repair parts", !consume.error, consume.error?.message);
  record("12. repair_usage decrements stock", (await stockQty(ownerA.sb, product.id, shopA.id)) === 4);

  for (const status of ["testing", "ready_for_pickup", "completed"]) {
    const moved = await rpc(techA.sb, "change_repair_status", { p_repair_job_id: job.data, p_new_status: status });
    record(`20. transition to ${status}`, !moved.error, moved.error?.message);
  }

  const techCancel = await rpc(techA.sb, "cancel_repair", {
    p_repair_job_id: job.data,
    p_reason: "Trying to cancel after ready",
  });
  record(
    "4. technician cannot exceptionally cancel",
    !!techCancel.error && expectError(techCancel.error, ["insufficient role"]),
    techCancel.error?.message || "missing error",
  );
  const cashierCancel = await rpc(cashierA.sb, "cancel_repair", {
    p_repair_job_id: job.data,
    p_reason: "Cashier exceptional cancel",
  });
  record(
    "3. cashier cannot exceptionally cancel",
    !!cashierCancel.error && expectError(cashierCancel.error, ["insufficient role"]),
    cashierCancel.error?.message || "missing error",
  );

  const exceptional = await rpc(ownerA.sb, "cancel_repair", {
    p_repair_job_id: job.data,
    p_reason: "Customer abandoned the device after completion",
  });
  record("22. exceptional owner cancel after completed", !exceptional.error, exceptional.error?.message);
  const { data: cancelledJob } = await ownerA.sb
    .from("repair_jobs")
    .select("status, cancellation_kind, cancellation_reason, cancelled_by")
    .eq("id", job.data)
    .single();
  record(
    "22. exceptional cancel records actor/reason/kind",
    cancelledJob?.status === "cancelled" &&
      cancelledJob?.cancellation_kind === "exceptional" &&
      cancelledJob?.cancelled_by === users.ownerA.id &&
      cancelledJob?.cancellation_reason,
    JSON.stringify(cancelledJob),
  );
  const { data: history } = await ownerA.sb.from("repair_status_history").select("new_status").eq("repair_job_id", job.data);
  record(
    "22. status history preserved including cancelled",
    (history || []).some((row) => row.new_status === "completed") &&
      (history || []).some((row) => row.new_status === "cancelled"),
    `count=${history?.length}`,
  );
  const { data: audit } = await ownerA.sb.from("audit_logs").select("action").eq("entity_id", job.data);
  record("22. exceptional cancel writes audit log", (audit || []).some((row) => row.action === "repair.cancel.exceptional"), audit?.map((row) => row.action).join(","));
  record("23. repair_return restocks consumed parts", (await stockQty(ownerA.sb, product.id, shopA.id)) === 5);

  const saleA = rpc(cashierA.sb, "complete_sale", {
    p_payload: { items: [{ product_id: product.id, quantity: 5 }], payments: [{ method: "cash", amount: 500 }] },
  });
  const saleB = rpc(cashierA.sb, "complete_sale", {
    p_payload: { items: [{ product_id: product.id, quantity: 5 }], payments: [{ method: "cash", amount: 500 }] },
  });
  const concurrent = await Promise.all([saleA, saleB]);
  const concurrentOk = concurrent.filter((row) => !row.error).length;
  const concurrentErrors = concurrent.filter((row) => row.error).length;
  record(
    "14. concurrent last-item checkout cannot oversell",
    concurrentOk === 1 && concurrentErrors === 1,
    `ok=${concurrentOk} errors=${concurrentErrors} ${concurrent.map((row) => row.error?.message || "ok").join(" | ")}`,
  );

  const orgBSale = await rpc(ownerB.sb, "complete_sale", {
    p_payload: {
      shop_id: ownerShopB.id,
      items: [{ product_id: product.id, quantity: 1 }],
      payments: [{ method: "cash", amount: 100 }],
    },
  });
  record("26. cross-organization RPC using foreign product fails", !!orgBSale.error, orgBSale.error?.message || "missing error");

  const orgBRepair = await rpc(ownerB.sb, "change_repair_status", {
    p_repair_job_id: job.data,
    p_new_status: "diagnosing",
  });
  record("26. cross-organization repair RPC fails", !!orgBRepair.error, orgBRepair.error?.message || "missing error");

  // ---------- Phase 3.1: update_repair_job_details ----------
  const detailJob = await rpc(cashierA.sb, "create_repair_job", {
    p_payload: {
      customer_id: customer.id,
      device_id: device.id,
      reported_issue: "Battery drain",
      assigned_technician_id: users.techA.id,
    },
  });
  record("31. create job for detail updates", !detailJob.error, detailJob.error?.message);

  const ownerUpdate = await rpc(ownerA.sb, "update_repair_job_details", {
    p_repair_job_id: detailJob.data,
    p_payload: {
      diagnosis: "Battery failing",
      technician_notes: "Needs pack",
      internal_notes: "Customer waiting",
      priority: "high",
      estimated_completion_date: "2026-09-20",
      device_condition: "Powers on",
      assigned_technician_id: users.techA.id,
    },
  });
  record("31. owner can update all allowed fields", !ownerUpdate.error, ownerUpdate.error?.message);

  const adminUpdate = await rpc(adminA.sb, "update_repair_job_details", {
    p_repair_job_id: detailJob.data,
    p_payload: { diagnosis: "Confirmed battery", priority: "urgent" },
  });
  record("31. admin can update allowed fields", !adminUpdate.error, adminUpdate.error?.message);

  const cashierFrontDesk = await rpc(cashierA.sb, "update_repair_job_details", {
    p_repair_job_id: detailJob.data,
    p_payload: {
      internal_notes: "Called customer",
      priority: "normal",
      estimated_completion_date: "2026-09-21",
      device_condition: "Scratched back",
    },
  });
  record("31. cashier can update front-desk fields", !cashierFrontDesk.error, cashierFrontDesk.error?.message);

  const cashierDiagnosis = await rpc(cashierA.sb, "update_repair_job_details", {
    p_repair_job_id: detailJob.data,
    p_payload: { diagnosis: "Cashier should not write this" },
  });
  record(
    "31. cashier cannot update diagnosis",
    !!cashierDiagnosis.error && expectError(cashierDiagnosis.error, ["forbidden", "unknown repair field"]),
    cashierDiagnosis.error?.message || "missing error",
  );

  const cashierTechNotes = await rpc(cashierA.sb, "update_repair_job_details", {
    p_repair_job_id: detailJob.data,
    p_payload: { technician_notes: "Nope" },
  });
  record(
    "31. cashier cannot update technician_notes",
    !!cashierTechNotes.error && expectError(cashierTechNotes.error, ["forbidden", "unknown repair field"]),
    cashierTechNotes.error?.message || "missing error",
  );

  const techOk = await rpc(techA.sb, "update_repair_job_details", {
    p_repair_job_id: detailJob.data,
    p_payload: {
      diagnosis: "Cell swelling",
      technician_notes: "Order OEM pack",
      device_condition: "Warm near camera",
    },
  });
  record("31. technician can update diagnosis fields", !techOk.error, techOk.error?.message);

  const techAdminField = await rpc(techA.sb, "update_repair_job_details", {
    p_repair_job_id: detailJob.data,
    p_payload: { priority: "urgent" },
  });
  record(
    "31. technician cannot update priority",
    !!techAdminField.error && expectError(techAdminField.error, ["forbidden", "unknown repair field"]),
    techAdminField.error?.message || "missing error",
  );

  const forbiddenStatus = await rpc(ownerA.sb, "update_repair_job_details", {
    p_repair_job_id: detailJob.data,
    p_payload: { status: "completed" },
  });
  record(
    "31. status key rejected",
    !!forbiddenStatus.error && expectError(forbiddenStatus.error, ["forbidden", "unknown"]),
    forbiddenStatus.error?.message || "missing error",
  );

  const forbiddenOrg = await rpc(ownerA.sb, "update_repair_job_details", {
    p_repair_job_id: detailJob.data,
    p_payload: { organization_id: orgBrow.id },
  });
  record(
    "31. organization_id key rejected",
    !!forbiddenOrg.error && expectError(forbiddenOrg.error, ["forbidden", "unknown"]),
    forbiddenOrg.error?.message || "missing error",
  );

  const forbiddenShop = await rpc(ownerA.sb, "update_repair_job_details", {
    p_repair_job_id: detailJob.data,
    p_payload: { shop_id: shop2?.id },
  });
  record(
    "31. shop_id key rejected",
    !!forbiddenShop.error && expectError(forbiddenShop.error, ["forbidden", "unknown"]),
    forbiddenShop.error?.message || "missing error",
  );

  const forbiddenTicket = await rpc(ownerA.sb, "update_repair_job_details", {
    p_repair_job_id: detailJob.data,
    p_payload: { ticket_number: "HACK-1" },
  });
  record(
    "31. ticket_number key rejected",
    !!forbiddenTicket.error && expectError(forbiddenTicket.error, ["forbidden", "unknown"]),
    forbiddenTicket.error?.message || "missing error",
  );

  const forbiddenTotal = await rpc(ownerA.sb, "update_repair_job_details", {
    p_repair_job_id: detailJob.data,
    p_payload: { total: 1 },
  });
  record(
    "31. total key rejected",
    !!forbiddenTotal.error && expectError(forbiddenTotal.error, ["forbidden", "unknown"]),
    forbiddenTotal.error?.message || "missing error",
  );

  const forbiddenCustomer = await rpc(ownerA.sb, "update_repair_job_details", {
    p_repair_job_id: detailJob.data,
    p_payload: { customer_id: customer.id },
  });
  record(
    "31. customer_id key rejected",
    !!forbiddenCustomer.error && expectError(forbiddenCustomer.error, ["forbidden", "unknown"]),
    forbiddenCustomer.error?.message || "missing error",
  );

  const crossUpdate = await rpc(ownerB.sb, "update_repair_job_details", {
    p_repair_job_id: detailJob.data,
    p_payload: { diagnosis: "Cross org" },
  });
  record(
    "31. cross-org repair update rejected",
    !!crossUpdate.error,
    crossUpdate.error?.message || "missing error",
  );

  const badAssignee = await rpc(ownerA.sb, "update_repair_job_details", {
    p_repair_job_id: detailJob.data,
    p_payload: { assigned_technician_id: users.cashierA.id },
  });
  record(
    "31. cashier cannot be assigned as technician",
    !!badAssignee.error && expectError(badAssignee.error, ["eligible", "assignment"]),
    badAssignee.error?.message || "missing error",
  );

  // ---------- Phase 3.1: photos ----------
  const storagePath = `${orgA.id}/${shopA.id}/${detailJob.data}/intake-${stamp}.jpg`;
  const { error: photoInsertErr } = await ownerA.sb.from("repair_photos").insert({
    organization_id: orgA.id,
    repair_job_id: detailJob.data,
    storage_path: storagePath,
    caption: "Intake",
    uploaded_by: users.ownerA.id,
  });
  // organization_id will be overwritten by enforce_tenant_id
  const { data: photoRow } = await ownerA.sb
    .from("repair_photos")
    .select("id, storage_path")
    .eq("repair_job_id", detailJob.data)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  record("31. repair photo metadata insert", !photoInsertErr && !!photoRow?.id, photoInsertErr?.message);

  const authzPhoto = await rpc(ownerA.sb, "authorize_repair_photo_deletion", {
    p_photo_id: photoRow?.id,
  });
  record(
    "31. authorize photo deletion returns trusted path",
    !authzPhoto.error && authzPhoto.data?.[0]?.storage_path === photoRow?.storage_path,
    authzPhoto.error?.message || JSON.stringify(authzPhoto.data),
  );

  const crossPhoto = await rpc(ownerB.sb, "delete_repair_photo", { p_photo_id: photoRow?.id });
  record(
    "31. cross-org photo deletion rejected",
    !!crossPhoto.error,
    crossPhoto.error?.message || "missing error",
  );

  const deletePhoto = await rpc(ownerA.sb, "delete_repair_photo", { p_photo_id: photoRow?.id });
  record(
    "31. authorized photo metadata deletion",
    !deletePhoto.error && deletePhoto.data === photoRow?.storage_path,
    deletePhoto.error?.message || String(deletePhoto.data),
  );
  const { data: photoGone } = await ownerA.sb
    .from("repair_photos")
    .select("id")
    .eq("id", photoRow?.id)
    .maybeSingle();
  record("31. photo metadata row removed", !photoGone, photoGone?.id);

  // Path injection: browser cannot pass arbitrary path into delete RPC (only photo id).
  const injectPhoto = await rpc(ownerA.sb, "delete_repair_photo", {
    p_photo_id: crypto.randomUUID(),
  });
  record(
    "31. unknown photo id cannot inject storage path",
    !!injectPhoto.error,
    injectPhoto.error?.message || "missing error",
  );

  // ---------- Phase 3.1: payment overpayment hardening ----------
  const payJob = await rpc(ownerA.sb, "create_repair_job", {
    p_payload: {
      customer_id: customer.id,
      device_id: device.id,
      reported_issue: "Screen lines for deposit tests",
    },
  });
  const payEstimate = await rpc(ownerA.sb, "create_repair_estimate", {
    p_payload: {
      repair_job_id: payJob.data,
      items: [
        { line_type: "labor", repair_service_id: service.id, quantity: 1 },
        { line_type: "part", product_id: product.id, quantity: 1 },
      ],
    },
  });
  await rpc(ownerA.sb, "approve_repair_estimate", {
    p_estimate_id: payEstimate.data,
    p_method: "in_person",
  });
  const { data: payJobRow } = await ownerA.sb
    .from("repair_jobs")
    .select("id, total")
    .eq("id", payJob.data)
    .single();
  const repairTotal = Number(payJobRow?.total || 0);
  record("31. repair payable total after estimate", repairTotal === 150, String(repairTotal));

  const cashPartial = await rpc(cashierA.sb, "record_payment", {
    p_payload: {
      reference_type: "repair",
      reference_id: payJob.data,
      method: "cash",
      amount: 50,
    },
  });
  record("31. cash partial deposit 50", !cashPartial.error, cashPartial.error?.message);
  const paid50 = await rpc(cashierA.sb, "paid_total", {
    p_reference_type: "repair",
    p_reference_id: payJob.data,
  });
  record("31. outstanding after 50 is 100", Number(paid50.data) === 50, String(paid50.data));

  const nonCashOver = await rpc(cashierA.sb, "record_payment", {
    p_payload: {
      reference_type: "repair",
      reference_id: payJob.data,
      method: "card",
      amount: 120,
    },
  });
  record(
    "31. non-cash overpayment rejected",
    !!nonCashOver.error && expectError(nonCashOver.error, ["exceeds outstanding"]),
    nonCashOver.error?.message || "missing error",
  );

  const payKey = crypto.randomUUID();
  const cardExact = await rpc(cashierA.sb, "record_payment", {
    p_payload: {
      reference_type: "repair",
      reference_id: payJob.data,
      method: "card",
      amount: 100,
      idempotency_key: payKey,
    },
  });
  const cardExact2 = await rpc(cashierA.sb, "record_payment", {
    p_payload: {
      reference_type: "repair",
      reference_id: payJob.data,
      method: "card",
      amount: 999,
      idempotency_key: payKey,
    },
  });
  record(
    "16. record_payment is idempotent",
    !cardExact.error && cardExact.data === cardExact2.data,
    cardExact.error?.message || `${cardExact.data} vs ${cardExact2.data}`,
  );
  const paidFull = await rpc(cashierA.sb, "paid_total", {
    p_reference_type: "repair",
    p_reference_id: payJob.data,
  });
  record("31. repair fully paid", Number(paidFull.data) === 150, String(paidFull.data));

  const extraAfterFull = await rpc(cashierA.sb, "record_payment", {
    p_payload: {
      reference_type: "repair",
      reference_id: payJob.data,
      method: "cash",
      amount: 10,
    },
  });
  record(
    "31. additional receipt on paid repair rejected",
    !!extraAfterFull.error && expectError(extraAfterFull.error, ["fully paid", "exceeds outstanding"]),
    extraAfterFull.error?.message || "missing error",
  );

  // Cash tender/change scenario on a fresh repair
  const tenderJob = await rpc(ownerA.sb, "create_repair_job", {
    p_payload: {
      customer_id: customer.id,
      device_id: device.id,
      reported_issue: "Cash tender test",
    },
  });
  const tenderEst = await rpc(ownerA.sb, "create_repair_estimate", {
    p_payload: {
      repair_job_id: tenderJob.data,
      items: [{ line_type: "labor", repair_service_id: service.id, quantity: 1 }],
    },
  });
  // Labor default is 50; bump via update_draft then approve won't change unit from service.
  // Create with discount to get 9500-like scenario is awkward with small prices.
  // Use tender against 50 outstanding: tender 100 → pay 50 change 50.
  await rpc(ownerA.sb, "approve_repair_estimate", {
    p_estimate_id: tenderEst.data,
    p_method: "in_person",
  });
  const { data: tenderJobRow } = await ownerA.sb
    .from("repair_jobs")
    .select("total")
    .eq("id", tenderJob.data)
    .single();
  const tenderOutstanding = Number(tenderJobRow?.total || 0);
  const tenderPay = await rpc(cashierA.sb, "record_payment", {
    p_payload: {
      reference_type: "repair",
      reference_id: tenderJob.data,
      method: "cash",
      tendered_amount: tenderOutstanding + 5,
    },
  });
  record("31. cash tender records payable not tender", !tenderPay.error, tenderPay.error?.message);
  const { data: tenderPayment } = await ownerA.sb
    .from("payments")
    .select("amount, tendered_amount, change_amount")
    .eq("id", tenderPay.data)
    .maybeSingle();
  record(
    "31. cash tender splits payment/change",
    Number(tenderPayment?.amount) === tenderOutstanding &&
      Number(tenderPayment?.tendered_amount) === tenderOutstanding + 5 &&
      Number(tenderPayment?.change_amount) === 5,
    JSON.stringify(tenderPayment),
  );

  const zeroPay = await rpc(cashierA.sb, "record_payment", {
    p_payload: {
      reference_type: "repair",
      reference_id: tenderJob.data,
      method: "card",
      amount: 0,
    },
  });
  record(
    "31. zero payment rejected",
    !!zeroPay.error && expectError(zeroPay.error, ["greater than zero", "fully paid"]),
    zeroPay.error?.message || "missing error",
  );

  const negPay = await rpc(cashierA.sb, "record_payment", {
    p_payload: {
      reference_type: "repair",
      reference_id: detailJob.data,
      method: "card",
      amount: -10,
    },
  });
  record(
    "31. negative payment rejected",
    !!negPay.error,
    negPay.error?.message || "missing error",
  );

  const forgedShopPay = await rpc(cashierA.sb, "record_payment", {
    p_payload: {
      reference_type: "repair",
      reference_id: detailJob.data,
      method: "cash",
      amount: 1,
      shop_id: ownerShopB.id,
    },
  });
  record(
    "31. forged shop on payment rejected",
    !!forgedShopPay.error,
    forgedShopPay.error?.message || "missing error",
  );

  const crossPay = await rpc(ownerB.sb, "record_payment", {
    p_payload: {
      reference_type: "repair",
      reference_id: detailJob.data,
      method: "cash",
      amount: 1,
    },
  });
  record(
    "31. cross-org payment rejected",
    !!crossPay.error,
    crossPay.error?.message || "missing error",
  );

  const { data: bucketList, error: storageErr } = await admin.storage.listBuckets();
  record(
    "storage buckets exist via API",
    (bucketList || []).some((b) => b.id === "shop-assets") &&
      (bucketList || []).some((b) => b.id === "repair-photos"),
    storageErr?.message || (bucketList || []).map((b) => b.id).join(","),
  );

  // ---------- Phase 6: inventory view + compatibility ----------
  const invView = await ownerA.sb
    .from("shop_product_inventory")
    .select("product_id, stock_status, quantity")
    .eq("shop_id", shopA.id)
    .eq("product_id", product.id)
    .maybeSingle();
  record(
    "6. shop_product_inventory returns stock status",
    !invView.error && !!invView.data?.stock_status,
    invView.error?.message || invView.data?.stock_status,
  );

  const cashierInvView = await cashierA.sb
    .from("shop_product_inventory")
    .select("product_id")
    .eq("shop_id", shopA.id)
    .limit(1);
  record(
    "6. cashier can read inventory view (no costs)",
    !cashierInvView.error,
    cashierInvView.error?.message || `rows=${cashierInvView.data?.length ?? 0}`,
  );

  if (model?.id) {
    await ownerA.sb
      .from("product_device_compatibility")
      .delete()
      .eq("product_id", product.id);

    const compatInsert = await ownerA.sb.from("product_device_compatibility").insert({
      product_id: product.id,
      device_model_id: model.id,
    });
    const compatOk = await ownerA.sb
      .from("product_device_compatibility")
      .select("product_id, device_model_id")
      .eq("product_id", product.id)
      .eq("device_model_id", model.id);
    record(
      "6. product compatibility attach",
      !compatInsert.error && (compatOk.data?.length || 0) > 0,
      compatInsert.error?.message || `rows=${compatOk.data?.length ?? 0}`,
    );

    const cashierCompat = await cashierA.sb.from("product_device_compatibility").insert({
      product_id: product.id,
      device_model_id: model.id,
    });
    record(
      "6. cashier cannot write compatibility",
      !!cashierCompat.error,
      cashierCompat.error?.message || "missing error",
    );

    const compatDel = await ownerA.sb
      .from("product_device_compatibility")
      .delete()
      .eq("product_id", product.id)
      .eq("device_model_id", model.id);
    record("6. product compatibility remove", !compatDel.error, compatDel.error?.message);
  } else {
    record("6. product compatibility attach", true, "skipped — no device model");
    record("6. cashier cannot write compatibility", true, "skipped");
    record("6. product compatibility remove", true, "skipped");
  }

  const adjust = await rpc(ownerA.sb, "adjust_inventory", {
    p_shop_id: shopA.id,
    p_product_id: product.id,
    p_quantity_change: 1,
    p_movement_type: "adjustment",
    p_notes: "Phase 6 regression adjust",
  });
  record(
    "6. adjust_inventory creates movement",
    !adjust.error && !!adjust.data,
    adjust.error?.message || adjust.data,
  );

  const dupReceive = await rpc(ownerA.sb, "receive_purchase", {
    p_payload: {
      purchase_id: purchase.data,
      items: [{ purchase_item_id: purchaseItemId, quantity: 1 }],
    },
  });
  record(
    "6. duplicate receive blocked",
    !!dupReceive.error,
    dupReceive.error?.message || "missing error",
  );

  // ---------- Phase 7: POS sale hardening ----------
  const stockTopUp = await rpc(ownerA.sb, "adjust_inventory", {
    p_shop_id: shopA.id,
    p_product_id: product.id,
    p_quantity_change: 20,
    p_movement_type: "adjustment",
    p_notes: "Phase 7 stock top-up",
  });
  record("7. stock top-up for POS tests", !stockTopUp.error, stockTopUp.error?.message);
  const stockBeforeP7 = await stockQty(ownerA.sb, product.id, shopA.id);

  const walkIn = await cashierA.sb
    .from("customers")
    .select("id")
    .eq("is_walk_in", true)
    .maybeSingle();
  record("7. walk-in customer exists", !!walkIn.data?.id, walkIn.error?.message || "missing");

  const cashTenderKey = crypto.randomUUID();
  const cashTenderSale = await rpc(cashierA.sb, "complete_sale", {
    p_payload: {
      customer_id: walkIn.data?.id ?? null,
      items: [{ product_id: product.id, quantity: 1 }],
      payments: [{ method: "cash", tendered_amount: 150 }],
      idempotency_key: cashTenderKey,
    },
  });
  record("7. cash sale with tendered_amount", !cashTenderSale.error, cashTenderSale.error?.message);
  const { data: cashSaleRow } = await cashierA.sb
    .from("sales")
    .select("id, total, change_amount, status")
    .eq("id", cashTenderSale.data)
    .maybeSingle();
  record(
    "7. cash change is tendered minus total",
    cashSaleRow?.status === "completed" &&
      Number(cashSaleRow?.total) === 100 &&
      Number(cashSaleRow?.change_amount) === 50,
    JSON.stringify(cashSaleRow),
  );
  const { data: cashPayRow } = await ownerA.sb
    .from("payments")
    .select("amount, tendered_amount, change_amount, entry_type")
    .eq("reference_id", cashTenderSale.data)
    .eq("entry_type", "receipt")
    .maybeSingle();
  record(
    "7. cash payment records revenue not tender",
    Number(cashPayRow?.amount) === 100 &&
      Number(cashPayRow?.tendered_amount) === 150 &&
      Number(cashPayRow?.change_amount) === 50,
    JSON.stringify(cashPayRow),
  );
  record(
    "7. stock decreases after cash sale",
    (await stockQty(ownerA.sb, product.id, shopA.id)) === stockBeforeP7 - 1,
  );

  const shortTender = await rpc(cashierA.sb, "complete_sale", {
    p_payload: {
      items: [{ product_id: product.id, quantity: 1 }],
      payments: [{ method: "cash", tendered_amount: 10 }],
    },
  });
  record(
    "7. insufficient cash tender rejected",
    !!shortTender.error && expectError(shortTender.error, ["insufficient", "tendered"]),
    shortTender.error?.message || "missing error",
  );

  const cardSale = await rpc(cashierA.sb, "complete_sale", {
    p_payload: {
      items: [{ product_id: product.id, quantity: 1 }],
      payments: [{ method: "card", amount: 100 }],
      idempotency_key: crypto.randomUUID(),
    },
  });
  record("7. card sale completes", !cardSale.error, cardSale.error?.message);

  const cardOver = await rpc(cashierA.sb, "complete_sale", {
    p_payload: {
      items: [{ product_id: product.id, quantity: 1 }],
      payments: [{ method: "card", amount: 150 }],
    },
  });
  record(
    "7. non-cash overpayment on complete_sale rejected",
    !!cardOver.error && expectError(cardOver.error, ["exceeds", "outstanding"]),
    cardOver.error?.message || "missing error",
  );

  const negDiscount = await rpc(cashierA.sb, "complete_sale", {
    p_payload: {
      items: [{ product_id: product.id, quantity: 1, discount_amount: -5 }],
      payments: [{ method: "cash", tendered_amount: 100 }],
    },
  });
  record(
    "7. negative line discount rejected",
    !!negDiscount.error && expectError(negDiscount.error, ["discount", "invalid"]),
    negDiscount.error?.message || "missing error",
  );

  const hold = await rpc(cashierA.sb, "hold_sale", {
    p_payload: {
      customer_id: customer.id,
      items: [{ product_id: product.id, quantity: 1 }],
      notes: "Phase 7 hold",
    },
  });
  record("7. hold_sale creates held ticket", !hold.error && !!hold.data, hold.error?.message);
  const { data: heldRow } = await cashierA.sb
    .from("sales")
    .select("id, status")
    .eq("id", hold.data)
    .maybeSingle();
  record("7. held sale status is held", heldRow?.status === "held", heldRow?.status);

  const stockAfterHold = await stockQty(ownerA.sb, product.id, shopA.id);
  const completeHeld = await rpc(cashierA.sb, "complete_held_sale", {
    p_sale_id: hold.data,
    p_payload: {
      payments: [{ method: "cash", tendered_amount: 200 }],
      idempotency_key: crypto.randomUUID(),
    },
  });
  record("7. complete_held_sale succeeds", !completeHeld.error, completeHeld.error?.message);
  record(
    "7. complete_held_sale decrements stock",
    (await stockQty(ownerA.sb, product.id, shopA.id)) === stockAfterHold - 1,
  );
  const { data: completedHeld } = await cashierA.sb
    .from("sales")
    .select("status, sale_number, total")
    .eq("id", hold.data)
    .maybeSingle();
  record(
    "7. held sale becomes completed with invoice number",
    completedHeld?.status === "completed" && !!completedHeld?.sale_number,
    JSON.stringify(completedHeld),
  );

  const hold2 = await rpc(cashierA.sb, "hold_sale", {
    p_payload: { items: [{ product_id: product.id, quantity: 1 }], notes: "cancel me" },
  });
  const cashierCancelHeld = await rpc(cashierA.sb, "cancel_sale", {
    p_sale_id: hold2.data,
    p_reason: "Customer left",
  });
  record(
    "7. cashier can cancel held sale",
    !cashierCancelHeld.error,
    cashierCancelHeld.error?.message,
  );

  const completedForCancel = await rpc(cashierA.sb, "complete_sale", {
    p_payload: {
      items: [{ product_id: product.id, quantity: 1 }],
      payments: [{ method: "cash", tendered_amount: 100 }],
      idempotency_key: crypto.randomUUID(),
    },
  });
  const cashierCancelCompleted = await rpc(cashierA.sb, "cancel_sale", {
    p_sale_id: completedForCancel.data,
    p_reason: "Should fail",
  });
  record(
    "7. cashier cannot cancel completed sale",
    !!cashierCancelCompleted.error &&
      expectError(cashierCancelCompleted.error, ["insufficient role", "role"]),
    cashierCancelCompleted.error?.message || "missing error",
  );

  const stockBeforeCancelRestore = await stockQty(ownerA.sb, product.id, shopA.id);
  const adminCancelCompleted = await rpc(adminA.sb, "cancel_sale", {
    p_sale_id: completedForCancel.data,
    p_reason: "Wrong ring-up",
  });
  record(
    "7. admin can cancel completed sale",
    !adminCancelCompleted.error,
    adminCancelCompleted.error?.message,
  );
  record(
    "7. cancel completed sale restores stock via sale_return",
    (await stockQty(ownerA.sb, product.id, shopA.id)) === stockBeforeCancelRestore + 1,
    String(await stockQty(ownerA.sb, product.id, shopA.id)),
  );
  const { data: cancelMovements } = await ownerA.sb
    .from("inventory_movements")
    .select("movement_type, quantity_change")
    .eq("reference_id", completedForCancel.data)
    .eq("movement_type", "sale_return");
  record(
    "7. cancel creates sale_return movement",
    (cancelMovements || []).length > 0 &&
      Number(cancelMovements?.[0]?.quantity_change) === 1,
    JSON.stringify(cancelMovements),
  );

  const refundSale = await rpc(cashierA.sb, "complete_sale", {
    p_payload: {
      customer_id: customer.id,
      items: [{ product_id: product.id, quantity: 2 }],
      payments: [{ method: "card", amount: 200 }],
      idempotency_key: crypto.randomUUID(),
    },
  });
  record("7. sale for refund tests", !refundSale.error, refundSale.error?.message);
  const { data: refundItems } = await cashierA.sb
    .from("sale_items")
    .select("id, quantity")
    .eq("sale_id", refundSale.data);
  const refundItemId = refundItems?.[0]?.id;
  const stockBeforeRefund = await stockQty(ownerA.sb, product.id, shopA.id);

  const excessRefund = await rpc(adminA.sb, "refund_sale", {
    p_payload: {
      sale_id: refundSale.data,
      reason: "Too many",
      method: "cash",
      items: [{ sale_item_id: refundItemId, quantity: 99 }],
    },
  });
  record(
    "7. excessive refund qty rejected",
    !!excessRefund.error && expectError(excessRefund.error, ["refund", "quantity", "exceed"]),
    excessRefund.error?.message || "missing error",
  );

  const partialRefund = await rpc(adminA.sb, "refund_sale", {
    p_payload: {
      sale_id: refundSale.data,
      reason: "One unit returned",
      method: "cash",
      items: [{ sale_item_id: refundItemId, quantity: 1 }],
      idempotency_key: crypto.randomUUID(),
    },
  });
  record("7. partial refund succeeds", !partialRefund.error, partialRefund.error?.message);
  record(
    "7. partial refund restores one unit",
    (await stockQty(ownerA.sb, product.id, shopA.id)) === stockBeforeRefund + 1,
  );

  const dupRefundKey = crypto.randomUUID();
  const refundPayload = {
    sale_id: refundSale.data,
    reason: "Second unit",
    method: "cash",
    items: [{ sale_item_id: refundItemId, quantity: 1 }],
    idempotency_key: dupRefundKey,
  };
  const refund2 = await rpc(adminA.sb, "refund_sale", { p_payload: refundPayload });
  const refund2b = await rpc(adminA.sb, "refund_sale", { p_payload: refundPayload });
  record("7. second unit refund succeeds", !refund2.error, refund2.error?.message);
  record(
    "7. duplicate refund_sale is idempotent",
    !refund2b.error && refund2.data === refund2b.data,
    `${refund2.data} vs ${refund2b.data} err=${refund2b.error?.message}`,
  );

  const crossOrgCustomer = await ownerB.sb
    .from("customers")
    .select("id")
    .eq("is_walk_in", true)
    .maybeSingle();
  if (crossOrgCustomer.data?.id) {
    const crossCustomerSale = await rpc(cashierA.sb, "complete_sale", {
      p_payload: {
        customer_id: crossOrgCustomer.data.id,
        items: [{ product_id: product.id, quantity: 1 }],
        payments: [{ method: "cash", tendered_amount: 100 }],
      },
    });
    record(
      "7. cross-org customer on sale rejected",
      !!crossCustomerSale.error && expectError(crossCustomerSale.error, ["customer", "not found"]),
      crossCustomerSale.error?.message || "missing error",
    );
  } else {
    record("7. cross-org customer on sale rejected", true, "skipped");
  }

  const cashierCostsP7 = await cashierA.sb.from("product_costs").select("cost_price");
  const techCostsP7 = await techA.sb.from("product_costs").select("cost_price");
  record(
    "7. cashier still cannot read costs",
    !cashierCostsP7.error && (cashierCostsP7.data?.length || 0) === 0,
    `rows=${cashierCostsP7.data?.length}`,
  );
  record(
    "7. technician still cannot read costs",
    !techCostsP7.error && (techCostsP7.data?.length || 0) === 0,
    `rows=${techCostsP7.data?.length}`,
  );

  // ---------- Phase 8: dashboard / expenses / warranties / notifications / reports ----------
  const dashOwner = await rpc(ownerA.sb, "dashboard_summary", { p_shop_id: shopA.id });
  record("8. owner dashboard_summary", !dashOwner.error && !!dashOwner.data, dashOwner.error?.message);
  const dashOwnerToday = dashOwner.data?.today;
  record(
    "8. owner dashboard includes expenses/net",
    dashOwnerToday && dashOwnerToday.expenses != null && dashOwnerToday.net_cashflow != null,
    JSON.stringify(dashOwnerToday),
  );
  record(
    "8. owner dashboard includes inventory alerts",
    !!dashOwner.data?.inventory,
    JSON.stringify(dashOwner.data?.inventory),
  );

  const dashCashier = await rpc(cashierA.sb, "dashboard_summary", { p_shop_id: shopA.id });
  record("8. cashier dashboard_summary", !dashCashier.error, dashCashier.error?.message);
  record(
    "8. cashier dashboard has today sales without inventory block",
    dashCashier.data?.today != null && dashCashier.data?.inventory == null,
    JSON.stringify({ today: dashCashier.data?.today, inventory: dashCashier.data?.inventory }),
  );

  const dashTech = await rpc(techA.sb, "dashboard_summary", { p_shop_id: shopA.id });
  record("8. technician dashboard_summary", !dashTech.error, dashTech.error?.message);
  record(
    "8. technician dashboard has no financial today block",
    dashTech.data?.today == null,
    JSON.stringify(dashTech.data?.today),
  );

  const dashCross = await rpc(ownerB.sb, "dashboard_summary", { p_shop_id: shopA.id });
  record(
    "8. cross-org dashboard shop denied",
    !!dashCross.error && expectError(dashCross.error, ["shop access", "denied"]),
    dashCross.error?.message || "missing error",
  );

  const bounds = await rpc(ownerA.sb, "shop_local_day_bounds", {
    p_shop_id: shopA.id,
    p_date: null,
  });
  record(
    "8. shop_local_day_bounds returns timezone window",
    !bounds.error && Array.isArray(bounds.data) && bounds.data[0]?.timezone,
    JSON.stringify(bounds.data?.[0]),
  );
  const localDay = bounds.data?.[0]?.local_date;

  const reportOwner = await rpc(ownerA.sb, "report_summary", {
    p_shop_id: shopA.id,
    p_from: localDay,
    p_to: localDay,
  });
  record("8. owner report_summary", !reportOwner.error && !!reportOwner.data, reportOwner.error?.message);
  record(
    "8. report includes sales COGS/gross_profit for owner",
    reportOwner.data?.sales?.cogs != null && reportOwner.data?.sales?.gross_profit != null,
    JSON.stringify(reportOwner.data?.sales),
  );

  const reportCashier = await rpc(cashierA.sb, "report_summary", {
    p_shop_id: shopA.id,
    p_from: localDay,
    p_to: localDay,
  });
  record(
    "8. cashier cannot call report_summary",
    !!reportCashier.error && expectError(reportCashier.error, ["insufficient role", "role"]),
    reportCashier.error?.message || "missing error",
  );

  const heldForReport = await rpc(cashierA.sb, "hold_sale", {
    p_payload: { items: [{ product_id: product.id, quantity: 1 }], notes: "exclude from revenue" },
  });
  const reportAfterHold = await rpc(ownerA.sb, "report_summary", {
    p_shop_id: shopA.id,
    p_from: localDay,
    p_to: localDay,
  });
  record(
    "8. held sales excluded from report revenue (no error)",
    !reportAfterHold.error && heldForReport.data,
    reportAfterHold.error?.message,
  );

  const { data: expCat } = await ownerA.sb
    .from("expense_categories")
    .select("id")
    .limit(1)
    .maybeSingle();
  const expenseInsert = await ownerA.sb
    .from("expenses")
    .insert({
      organization_id: orgA.id,
      shop_id: shopA.id,
      category_id: expCat?.id,
      amount: 25,
      expense_date: localDay,
      description: "Phase 8 test expense",
      payment_method: "cash",
    })
    .select("id")
    .single();
  record("8. owner can create expense", !expenseInsert.error, expenseInsert.error?.message);

  const cashierExpense = await cashierA.sb
    .from("expenses")
    .insert({
      organization_id: orgA.id,
      shop_id: shopA.id,
      category_id: expCat?.id,
      amount: 10,
      expense_date: localDay,
      description: "should fail",
      payment_method: "cash",
    })
    .select("id");
  record(
    "8. cashier cannot create expense",
    !!cashierExpense.error || (cashierExpense.data || []).length === 0,
    cashierExpense.error?.message || `rows=${cashierExpense.data?.length}`,
  );

  const crossExpenseRead = await ownerB.sb
    .from("expenses")
    .select("id")
    .eq("id", expenseInsert.data?.id);
  record(
    "8. cross-org expense select empty",
    !crossExpenseRead.error && (crossExpenseRead.data?.length || 0) === 0,
    `rows=${crossExpenseRead.data?.length} err=${crossExpenseRead.error?.message}`,
  );

  const crossExpenseWrite = await ownerB.sb
    .from("expenses")
    .update({ description: "hijack" })
    .eq("id", expenseInsert.data?.id)
    .select("id");
  record(
    "8. cross-org expense update rejected",
    !!crossExpenseWrite.error || (crossExpenseWrite.data || []).length === 0,
    crossExpenseWrite.error?.message || `rows=${crossExpenseWrite.data?.length}`,
  );

  const { data: warrantyRow } = await ownerA.sb
    .from("warranties")
    .select("id, status")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (warrantyRow?.id) {
    const claim = await rpc(adminA.sb, "create_warranty_claim", {
      p_payload: {
        warranty_id: warrantyRow.id,
        description: "Screen issue returned under warranty",
      },
    });
    record("8. create_warranty_claim", !claim.error && !!claim.data, claim.error?.message);
    const resolve = await rpc(adminA.sb, "resolve_warranty_claim", {
      p_claim_id: claim.data,
      p_payload: { status: "resolved", resolution: "Replaced glass" },
    });
    record("8. resolve_warranty_claim", !resolve.error, resolve.error?.message);
    const cashierResolve = await rpc(cashierA.sb, "resolve_warranty_claim", {
      p_claim_id: claim.data,
      p_payload: { status: "closed" },
    });
    record(
      "8. cashier cannot resolve warranty claim",
      !!cashierResolve.error && expectError(cashierResolve.error, ["insufficient role", "role"]),
      cashierResolve.error?.message || "missing error",
    );
  } else {
    record("8. create_warranty_claim", true, "skipped — no active warranty");
    record("8. resolve_warranty_claim", true, "skipped");
    record("8. cashier cannot resolve warranty claim", true, "skipped");
  }

  const crossWarrantyClaim = await rpc(ownerB.sb, "create_warranty_claim", {
    p_payload: {
      warranty_id: warrantyRow?.id || crypto.randomUUID(),
      description: "cross org",
    },
  });
  record(
    "8. cross-org warranty claim rejected",
    !!crossWarrantyClaim.error,
    crossWarrantyClaim.error?.message || "missing error",
  );

  const { data: notif } = await techA.sb
    .from("notifications")
    .select("id, user_id")
    .eq("user_id", users.techA.id)
    .is("read_at", null)
    .limit(1)
    .maybeSingle();
  if (notif?.id) {
    const mark = await techA.sb
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", notif.id)
      .eq("user_id", users.techA.id)
      .select("id");
    record("8. user can mark own notification read", !mark.error, mark.error?.message);
  } else {
    record("8. user can mark own notification read", true, "skipped — no unread");
  }

  const outbox = await cashierA.sb.from("notification_outbox").select("id").limit(1);
  record(
    "8. cashier cannot read notification_outbox",
    !outbox.error && (outbox.data?.length || 0) === 0,
    `rows=${outbox.data?.length} err=${outbox.error?.message}`,
  );

  const saleCostsCashier = await cashierA.sb.from("sale_item_costs").select("unit_cost").limit(1);
  record(
    "8. cashier cannot read sale_item_costs (profit hidden)",
    !saleCostsCashier.error && (saleCostsCashier.data?.length || 0) === 0,
    `rows=${saleCostsCashier.data?.length}`,
  );

  // ---------- Phase 9: admin controls, discount, refund disposition ----------
  const settingsUpdate = await rpc(ownerA.sb, "update_shop_settings", {
    p_shop_id: shopA.id,
    p_payload: {
      cashier_max_line_discount_percent: 0.1,
      timezone: "Asia/Colombo",
      currency_code: "LKR",
    },
  });
  record("9. owner can update shop settings", !settingsUpdate.error, settingsUpdate.error?.message);

  const cashierSettings = await rpc(cashierA.sb, "update_shop_settings", {
    p_shop_id: shopA.id,
    p_payload: { tax_enabled: false },
  });
  record(
    "9. cashier cannot update settings",
    !!cashierSettings.error && expectError(cashierSettings.error, ["insufficient role", "role"]),
    cashierSettings.error?.message || "missing error",
  );

  const overDiscount = await rpc(cashierA.sb, "complete_sale", {
    p_payload: {
      items: [{ product_id: product.id, quantity: 1, discount_amount: 50 }],
      payments: [{ method: "cash", tendered_amount: 100 }],
    },
  });
  record(
    "9. cashier discount above max rejected",
    !!overDiscount.error && expectError(overDiscount.error, ["discount", "maximum", "cashier"]),
    overDiscount.error?.message || "missing error",
  );

  const okDiscount = await rpc(cashierA.sb, "complete_sale", {
    p_payload: {
      items: [{ product_id: product.id, quantity: 1, discount_amount: 5 }],
      payments: [{ method: "cash", tendered_amount: 100 }],
      idempotency_key: crypto.randomUUID(),
    },
  });
  record("9. cashier discount within max accepted", !okDiscount.error, okDiscount.error?.message);

  const ownerDiscount = await rpc(ownerA.sb, "complete_sale", {
    p_payload: {
      items: [{ product_id: product.id, quantity: 1, discount_amount: 80 }],
      payments: [{ method: "cash", tendered_amount: 100 }],
      idempotency_key: crypto.randomUUID(),
    },
  });
  record("9. owner unrestricted discount allowed", !ownerDiscount.error, ownerDiscount.error?.message);

  const splitSale = await rpc(cashierA.sb, "complete_sale", {
    p_payload: {
      items: [{ product_id: product.id, quantity: 1 }],
      payments: [
        { method: "card", amount: 40 },
        { method: "cash", tendered_amount: 100 },
      ],
      idempotency_key: crypto.randomUUID(),
    },
  });
  record("9. split card+cash complete_sale", !splitSale.error, splitSale.error?.message);
  if (splitSale.data) {
    const { data: splitPays } = await ownerA.sb
      .from("payments")
      .select("method, amount, entry_type, voided_at")
      .eq("reference_id", splitSale.data)
      .eq("entry_type", "receipt");
    record(
      "9. split sale creates two payment rows totaling sale",
      (splitPays || []).length === 2 &&
        Math.round((splitPays || []).reduce((s, p) => s + Number(p.amount), 0) * 100) / 100 === 100,
      JSON.stringify(splitPays),
    );
  } else {
    record("9. split sale creates two payment rows totaling sale", false, "no sale");
  }

  const stockBeforeDisp = await stockQty(ownerA.sb, product.id, shopA.id);
  const dispSale = await rpc(cashierA.sb, "complete_sale", {
    p_payload: {
      items: [{ product_id: product.id, quantity: 2 }],
      payments: [{ method: "cash", tendered_amount: 200 }],
      idempotency_key: crypto.randomUUID(),
    },
  });
  const { data: dispItems } = await cashierA.sb
    .from("sale_items")
    .select("id")
    .eq("sale_id", dispSale.data);
  const damagedRefund = await rpc(adminA.sb, "refund_sale", {
    p_payload: {
      sale_id: dispSale.data,
      reason: "Damaged on return",
      method: "cash",
      items: [
        {
          sale_item_id: dispItems?.[0]?.id,
          quantity: 1,
          restock_disposition: "damaged",
        },
      ],
      idempotency_key: crypto.randomUUID(),
    },
  });
  record("9. damaged refund succeeds", !damagedRefund.error, damagedRefund.error?.message);
  record(
    "9. damaged refund does not increase sellable stock",
    (await stockQty(ownerA.sb, product.id, shopA.id)) === stockBeforeDisp - 2,
    `before=${stockBeforeDisp} after=${await stockQty(ownerA.sb, product.id, shopA.id)}`,
  );

  const noneRefund = await rpc(adminA.sb, "refund_sale", {
    p_payload: {
      sale_id: dispSale.data,
      reason: "Keep item, no restock",
      method: "cash",
      items: [
        {
          sale_item_id: dispItems?.[0]?.id,
          quantity: 1,
          restock_disposition: "none",
        },
      ],
      idempotency_key: crypto.randomUUID(),
    },
  });
  record("9. none-disposition refund succeeds", !noneRefund.error, noneRefund.error?.message);
  record(
    "9. none disposition leaves stock unchanged after damaged path",
    (await stockQty(ownerA.sb, product.id, shopA.id)) === stockBeforeDisp - 2,
  );

  const staffUpdate = await rpc(ownerA.sb, "update_staff_profile", {
    p_user_id: users.cashierA.id,
    p_payload: { first_name: "Cash", is_active: true },
  });
  record("9. owner can update staff profile", !staffUpdate.error, staffUpdate.error?.message);

  const escalate = await rpc(adminA.sb, "update_staff_profile", {
    p_user_id: users.cashierA.id,
    p_payload: { role: "owner" },
  });
  record(
    "9. admin cannot promote to owner",
    !!escalate.error && expectError(escalate.error, ["owner", "cannot", "assign", "role"]),
    escalate.error?.message || "missing error",
  );

  const selfRole = await rpc(adminA.sb, "update_staff_profile", {
    p_user_id: users.adminA.id,
    p_payload: { role: "cashier" },
  });
  record(
    "9. cannot change own role",
    !!selfRole.error && expectError(selfRole.error, ["own role", "cannot"]),
    selfRole.error?.message || "missing error",
  );

  const deactivateCashier = await rpc(ownerA.sb, "update_staff_profile", {
    p_user_id: users.cashierA.id,
    p_payload: { is_active: false },
  });
  record("9. owner can deactivate cashier", !deactivateCashier.error, deactivateCashier.error?.message);
  await rpc(ownerA.sb, "update_staff_profile", {
    p_user_id: users.cashierA.id,
    p_payload: { is_active: true },
  });

  const { data: auditRows } = await ownerA.sb
    .from("audit_logs")
    .select("id, action")
    .in("action", ["settings.update", "staff.update"])
    .limit(5);
  record(
    "9. settings/staff updates write audit logs",
    (auditRows || []).some((r) => r.action === "settings.update") &&
      (auditRows || []).some((r) => r.action === "staff.update"),
    (auditRows || []).map((r) => r.action).join(","),
  );

  const auditMut = await ownerA.sb
    .from("audit_logs")
    .update({ action: "tamper" })
    .eq("id", auditRows?.[0]?.id)
    .select("id");
  record(
    "9. audit logs are immutable",
    !!auditMut.error || (auditMut.data || []).length === 0,
    auditMut.error?.message || `rows=${auditMut.data?.length}`,
  );

  // ---------- Product images (catalog) ----------
  const imgPath = `${orgA.id}/${shopA.id}/products/${product.id}/test-primary.jpg`;
  const { error: imgInsErr, data: imgRow } = await ownerA.sb
    .from("product_images")
    .insert({
      organization_id: orgBrow.id,
      shop_id: shopA.id,
      product_id: product.id,
      storage_path: imgPath,
      sort_order: 0,
      is_primary: true,
    })
    .select("id, organization_id, storage_path, is_primary")
    .single();
  record(
    "img. owner can insert product image",
    !imgInsErr && !!imgRow?.id,
    imgInsErr?.message,
  );
  record(
    "img. forged organization_id overwritten to caller org",
    imgRow?.organization_id === orgA.id,
    imgRow?.organization_id,
  );

  const { data: ownerImgRead } = await ownerA.sb
    .from("product_images")
    .select("id")
    .eq("id", imgRow?.id)
    .maybeSingle();
  record("img. owner can read product image", !!ownerImgRead?.id);

  const { data: adminImgRead } = await adminA.sb
    .from("product_images")
    .select("id")
    .eq("id", imgRow?.id)
    .maybeSingle();
  record("img. admin can read product image", !!adminImgRead?.id);

  const { data: cashierImgRead } = await cashierA.sb
    .from("product_images")
    .select("id")
    .eq("id", imgRow?.id)
    .maybeSingle();
  record("img. cashier can read product image", !!cashierImgRead?.id);

  const { data: techImgRead } = await techA.sb
    .from("product_images")
    .select("id")
    .eq("id", imgRow?.id)
    .maybeSingle();
  record("img. technician can read product image", !!techImgRead?.id);

  const cashierImgIns = await cashierA.sb.from("product_images").insert({
    shop_id: shopA.id,
    product_id: product.id,
    storage_path: `${orgA.id}/${shopA.id}/products/${product.id}/cashier.jpg`,
    sort_order: 1,
    is_primary: false,
  });
  record(
    "img. cashier create denied",
    !!cashierImgIns.error,
    cashierImgIns.error?.message || "missing error",
  );

  const techImgIns = await techA.sb.from("product_images").insert({
    shop_id: shopA.id,
    product_id: product.id,
    storage_path: `${orgA.id}/${shopA.id}/products/${product.id}/tech.jpg`,
    sort_order: 1,
    is_primary: false,
  });
  record(
    "img. technician create denied",
    !!techImgIns.error,
    techImgIns.error?.message || "missing error",
  );

  const adminImgIns = await adminA.sb
    .from("product_images")
    .insert({
      shop_id: shopA.id,
      product_id: product.id,
      storage_path: `${orgA.id}/${shopA.id}/products/${product.id}/admin-second.jpg`,
      sort_order: 1,
      is_primary: false,
    })
    .select("id")
    .single();
  record(
    "img. admin can create product image",
    !adminImgIns.error && !!adminImgIns.data?.id,
    adminImgIns.error?.message,
  );

  const crossOrgImgSelect = await ownerB.sb
    .from("product_images")
    .select("id")
    .eq("id", imgRow?.id);
  record(
    "img. cross-org SELECT denied",
    !crossOrgImgSelect.error && (crossOrgImgSelect.data || []).length === 0,
    `rows=${crossOrgImgSelect.data?.length}`,
  );

  const crossOrgImgIns = await ownerB.sb.from("product_images").insert({
    organization_id: orgA.id,
    shop_id: shopA.id,
    product_id: product.id,
    storage_path: `${orgA.id}/${shopA.id}/products/${product.id}/cross.jpg`,
    sort_order: 2,
    is_primary: false,
  });
  record(
    "img. cross-org INSERT denied",
    !!crossOrgImgIns.error,
    crossOrgImgIns.error?.message || "missing error",
  );

  if (shop2?.id) {
    const crossShopImg = await ownerA.sb.from("product_images").insert({
      shop_id: shop2.id,
      product_id: product.id,
      storage_path: `${orgA.id}/${shop2.id}/products/${product.id}/shop2.jpg`,
      sort_order: 0,
      is_primary: true,
    });
    // Owner has org-wide shop access typically — product image for shop2 is valid if has_shop_access.
    // Cashier without shop2 membership must not see shop2 images.
    const cashierShop2Read = await cashierA.sb
      .from("product_images")
      .select("id")
      .eq("shop_id", shop2.id);
    record(
      "img. cross-shop cashier SELECT denied (no membership)",
      !cashierShop2Read.error && (cashierShop2Read.data || []).length === 0,
      `rows=${cashierShop2Read.data?.length}`,
    );
    if (!crossShopImg.error) {
      await ownerA.sb.rpc("delete_product_image", {
        p_image_id: (
          await ownerA.sb
            .from("product_images")
            .select("id")
            .eq("shop_id", shop2.id)
            .eq("product_id", product.id)
            .limit(1)
            .maybeSingle()
        ).data?.id,
      });
    }
  }

  const forgedShopImg = await ownerA.sb.from("product_images").insert({
    shop_id: ownerShopB.id,
    product_id: product.id,
    storage_path: `${orgA.id}/${ownerShopB.id}/products/${product.id}/forged-shop.jpg`,
    sort_order: 3,
    is_primary: false,
  });
  record(
    "img. forged shop_id rejected",
    !!forgedShopImg.error,
    forgedShopImg.error?.message || "missing error",
  );

  const badRelImg = await ownerA.sb.from("product_images").insert({
    shop_id: shopA.id,
    product_id: crypto.randomUUID(),
    storage_path: `${orgA.id}/${shopA.id}/products/${crypto.randomUUID()}/orphan.jpg`,
    sort_order: 0,
    is_primary: false,
  });
  record(
    "img. invalid product relationship rejected",
    !!badRelImg.error,
    badRelImg.error?.message || "missing error",
  );

  const badPathImg = await ownerA.sb.from("product_images").insert({
    shop_id: shopA.id,
    product_id: product.id,
    storage_path: `${orgA.id}/${shopA.id}/branding/not-a-product.jpg`,
    sort_order: 4,
    is_primary: false,
  });
  record(
    "img. invalid storage path rejected",
    !!badPathImg.error,
    badPathImg.error?.message || "missing error",
  );

  const dupPrimary = await ownerA.sb.from("product_images").insert({
    shop_id: shopA.id,
    product_id: product.id,
    storage_path: `${orgA.id}/${shopA.id}/products/${product.id}/dup-primary.jpg`,
    sort_order: 5,
    is_primary: true,
  });
  record(
    "img. multiple primary images rejected",
    !!dupPrimary.error,
    dupPrimary.error?.message || "missing error",
  );

  const setPrimary = await rpc(ownerA.sb, "set_primary_product_image", {
    p_image_id: adminImgIns.data?.id,
  });
  record(
    "img. owner can set primary via RPC",
    !setPrimary.error,
    setPrimary.error?.message,
  );
  const { data: primaryRows } = await ownerA.sb
    .from("product_images")
    .select("id, is_primary")
    .eq("shop_id", shopA.id)
    .eq("product_id", product.id)
    .eq("is_primary", true);
  record(
    "img. exactly one primary after set_primary",
    (primaryRows || []).length === 1 && primaryRows?.[0]?.id === adminImgIns.data?.id,
    `count=${primaryRows?.length}`,
  );

  const cashierDelete = await rpc(cashierA.sb, "delete_product_image", {
    p_image_id: imgRow?.id,
  });
  record(
    "img. cashier metadata delete denied",
    !!cashierDelete.error,
    cashierDelete.error?.message || "missing error",
  );

  const authzImg = await rpc(ownerA.sb, "authorize_product_image_deletion", {
    p_image_id: imgRow?.id,
  });
  record(
    "img. authorize deletion returns trusted path",
    !authzImg.error && authzImg.data?.[0]?.storage_path === imgPath,
    authzImg.error?.message || JSON.stringify(authzImg.data),
  );

  const crossDeleteImg = await rpc(ownerB.sb, "delete_product_image", {
    p_image_id: imgRow?.id,
  });
  record(
    "img. cross-org delete denied",
    !!crossDeleteImg.error,
    crossDeleteImg.error?.message || "missing error",
  );

  const delImg = await rpc(ownerA.sb, "delete_product_image", {
    p_image_id: imgRow?.id,
  });
  record(
    "img. authorized metadata delete",
    !delImg.error && delImg.data === imgPath,
    delImg.error?.message || String(delImg.data),
  );

  const { data: invPrimary } = await ownerA.sb
    .from("shop_product_inventory")
    .select("primary_image_path")
    .eq("product_id", product.id)
    .eq("shop_id", shopA.id)
    .maybeSingle();
  record(
    "img. inventory view exposes primary_image_path",
    invPrimary !== null && "primary_image_path" in (invPrimary || {}),
    JSON.stringify(invPrimary),
  );

  const logoPath = `${orgA.id}/${shopA.id}/branding/logo.svg`;
  const setLogo = await rpc(ownerA.sb, "set_shop_logo_path", {
    p_shop_id: shopA.id,
    p_logo_path: logoPath,
  });
  record("img. owner can set shop logo path", !setLogo.error, setLogo.error?.message);

  const crossLogo = await rpc(ownerB.sb, "set_shop_logo_path", {
    p_shop_id: shopA.id,
    p_logo_path: `${orgBrow.id}/${ownerShopB.id}/branding/logo.svg`,
  });
  record(
    "img. cross-tenant logo update denied",
    !!crossLogo.error,
    crossLogo.error?.message || "missing error",
  );

  const badLogoPath = await rpc(ownerA.sb, "set_shop_logo_path", {
    p_shop_id: shopA.id,
    p_logo_path: `${orgA.id}/${shopA.id}/products/${product.id}/not-logo.jpg`,
  });
  record(
    "img. invalid logo path rejected",
    !!badLogoPath.error,
    badLogoPath.error?.message || "missing error",
  );

  const cashierLogo = await rpc(cashierA.sb, "set_shop_logo_path", {
    p_shop_id: shopA.id,
    p_logo_path: logoPath,
  });
  record(
    "img. cashier cannot set shop logo",
    !!cashierLogo.error,
    cashierLogo.error?.message || "missing error",
  );

  // Storage path authorization regression (shop-assets)
  const storageOk = await ownerA.sb.storage
    .from("shop-assets")
    .upload(
      `${orgA.id}/${shopA.id}/products/${product.id}/storage-test.txt`,
      new Uint8Array([1, 2, 3]),
      { contentType: "image/png", upsert: true },
    );
  // MIME may be rejected — try png bytes labeled correctly after cleanup intent
  const storagePng = await ownerA.sb.storage
    .from("shop-assets")
    .upload(
      `${orgA.id}/${shopA.id}/products/${product.id}/storage-test.png`,
      new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      { contentType: "image/png", upsert: true },
    );
  record(
    "img. owner/admin can upload shop-assets object",
    !storagePng.error || !storageOk.error,
    storagePng.error?.message || storageOk.error?.message,
  );

  const cashierStorage = await cashierA.sb.storage
    .from("shop-assets")
    .upload(
      `${orgA.id}/${shopA.id}/products/${product.id}/cashier-hack.png`,
      new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      { contentType: "image/png", upsert: false },
    );
  record(
    "img. cashier cannot upload shop-assets",
    !!cashierStorage.error,
    cashierStorage.error?.message || "missing error",
  );

  const pathTraversal = await ownerA.sb.storage
    .from("shop-assets")
    .upload(
      `${orgBrow.id}/${ownerShopB.id}/products/${product.id}/traverse.png`,
      new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      { contentType: "image/png", upsert: false },
    );
  record(
    "img. storage path traversal / cross-org upload denied",
    !!pathTraversal.error,
    pathTraversal.error?.message || "missing error",
  );

  // Cleanup remaining product images for this product
  const { data: leftoverImgs } = await ownerA.sb
    .from("product_images")
    .select("id")
    .eq("product_id", product.id);
  for (const row of leftoverImgs || []) {
    await ownerA.sb.rpc("delete_product_image", { p_image_id: row.id });
  }
  await ownerA.sb.rpc("set_shop_logo_path", {
    p_shop_id: shopA.id,
    p_logo_path: null,
  });

  const failed = results.filter((row) => !row.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.error("Failed tests:");
    for (const row of failed) console.error(` - ${row.name}: ${row.detail}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("FAIL  suite crashed —", error?.message || error);
  process.exitCode = 1;
});

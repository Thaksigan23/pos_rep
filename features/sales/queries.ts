import "server-only"

import { PAGE_SIZE } from "@/lib/navigation/paths"
import { isSaleStatus, type SaleStatus } from "@/lib/sales/constants"
import { createClient } from "@/lib/supabase/server"
import { signShopAssetPath, signShopAssetPaths } from "@/lib/storage/signed-urls"

export type PosProduct = {
  product_id: string
  name: string
  sku: string
  barcode: string | null
  selling_price: number
  quantity: number
  stock_status: string | null
  track_inventory: boolean
  category_id: string | null
  category_name: string | null
  primary_image_path: string | null
  primary_image_url: string | null
}

export type WalkInCustomer = {
  id: string
  first_name: string
  last_name: string
  phone: string | null
  is_walk_in: boolean
}

export async function searchPosProducts(shopId: string, q: string) {
  const supabase = await createClient()
  const trimmed = q.trim()
  let query = supabase
    .from("shop_product_inventory")
    .select(
      "product_id, name, sku, barcode, selling_price, quantity, stock_status, track_inventory, category_id, primary_image_path"
    )
    .eq("shop_id", shopId)
    .eq("is_active", true)
    .order("name")
    .limit(60)

  if (trimmed) {
    const pattern = `%${trimmed}%`
    query = query.or(
      `name.ilike.${pattern},sku.ilike.${pattern},barcode.ilike.${pattern}`
    )
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)

  const rows = (data ?? []).filter((row) => typeof row.product_id === "string")
  const signed = await signShopAssetPaths(
    rows.map((r) => r.primary_image_path as string | null)
  )

  return rows.map((row) => ({
    product_id: row.product_id as string,
    name: row.name ?? "",
    sku: row.sku ?? "",
    barcode: row.barcode,
    selling_price: Number(row.selling_price ?? 0),
    quantity: Number(row.quantity ?? 0),
    stock_status: row.stock_status,
    track_inventory: Boolean(row.track_inventory),
    category_id: (row.category_id as string | null) ?? null,
    category_name: null,
    primary_image_path: (row.primary_image_path as string | null) ?? null,
    primary_image_url: row.primary_image_path
      ? signed.get(row.primary_image_path as string) ?? null
      : null,
  }))
}

export async function findPosProductByBarcode(shopId: string, barcode: string) {
  const code = barcode.trim()
  if (!code) return null

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("shop_product_inventory")
    .select(
      "product_id, name, sku, barcode, selling_price, quantity, stock_status, track_inventory, primary_image_path"
    )
    .eq("shop_id", shopId)
    .eq("is_active", true)
    .eq("barcode", code)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data?.product_id) return null

  const signed = await signShopAssetPaths([
    data.primary_image_path as string | null,
  ])
  return {
    product_id: data.product_id as string,
    name: data.name ?? "",
    sku: data.sku ?? "",
    barcode: data.barcode,
    selling_price: Number(data.selling_price ?? 0),
    quantity: Number(data.quantity ?? 0),
    stock_status: data.stock_status,
    track_inventory: Boolean(data.track_inventory),
    category_id: null,
    category_name: null,
    primary_image_path: (data.primary_image_path as string | null) ?? null,
    primary_image_url: data.primary_image_path
      ? signed.get(data.primary_image_path as string) ?? null
      : null,
  }
}

export async function getWalkInCustomer(): Promise<WalkInCustomer | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("customers")
    .select("id, first_name, last_name, phone, is_walk_in")
    .eq("is_walk_in", true)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data
}

export async function searchSales(options: {
  q?: string
  status?: string
  fromDate?: string
  toDate?: string
  page?: number
  shopId: string
}) {
  const page = Math.max(1, options.page ?? 1)
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1
  const supabase = await createClient()

  let query = supabase
    .from("sales")
    .select(
      `id, sale_number, status, total, subtotal, tax_amount, discount_amount,
       created_at, completed_at, held_at, customer_id,
       customers(id, first_name, last_name, phone, is_walk_in)`,
      { count: "exact" }
    )
    .eq("shop_id", options.shopId)
    .order("created_at", { ascending: false })
    .range(from, to)

  if (options.status && options.status !== "all" && isSaleStatus(options.status)) {
    query = query.eq("status", options.status as SaleStatus)
  }

  if (options.fromDate) {
    query = query.gte("created_at", `${options.fromDate}T00:00:00.000Z`)
  }
  if (options.toDate) {
    query = query.lte("created_at", `${options.toDate}T23:59:59.999Z`)
  }

  const q = options.q?.trim()
  if (q) {
    const pattern = `%${q}%`
    const { data: matchedCustomers } = await supabase
      .from("customers")
      .select("id")
      .or(
        `first_name.ilike.${pattern},last_name.ilike.${pattern},phone.ilike.${pattern},customer_number.ilike.${pattern}`
      )
      .limit(50)
    const customerIds = (matchedCustomers ?? []).map((c) => c.id)
    if (customerIds.length > 0) {
      query = query.or(
        `sale_number.ilike.${pattern},notes.ilike.${pattern},customer_id.in.(${customerIds.join(",")})`
      )
    } else {
      query = query.or(`sale_number.ilike.${pattern},notes.ilike.${pattern}`)
    }
  }

  const { data, error, count } = await query
  if (error) throw new Error(error.message)

  return {
    rows: data ?? [],
    total: count ?? 0,
    page,
    pageSize: PAGE_SIZE,
  }
}

export async function listHeldSales(shopId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("sales")
    .select(
      `id, sale_number, status, notes, held_at, created_at, customer_id, total,
       customers(id, first_name, last_name, is_walk_in),
       sale_items(id, quantity, line_total, description_snapshot)`
    )
    .eq("shop_id", shopId)
    .eq("status", "held")
    .order("held_at", { ascending: false })
    .limit(50)

  if (error) throw new Error(error.message)
  return data ?? []
}

export async function getHeldSaleForResume(saleId: string) {
  const supabase = await createClient()
  const { data: sale, error } = await supabase
    .from("sales")
    .select(
      `id, sale_number, status, notes, held_at, shop_id, customer_id, discount_amount,
       customers(id, first_name, last_name, phone, is_walk_in),
       sale_items(
         id, product_id, description_snapshot, quantity, unit_price,
         discount_amount, tax_amount, line_total
       )`
    )
    .eq("id", saleId)
    .eq("status", "held")
    .maybeSingle()

  if (error) throw new Error(error.message)
  return sale
}

export async function getSaleDetail(saleId: string) {
  const supabase = await createClient()
  const { data: sale, error } = await supabase
    .from("sales")
    .select(
      `id, sale_number, status, notes, shop_id, customer_id, created_by,
       subtotal, discount_amount, tax_amount, total, change_amount,
       created_at, completed_at, held_at, cancelled_at,
       customers(id, first_name, last_name, phone, email, is_walk_in, customer_number),
       sale_items(
         id, product_id, description_snapshot, quantity, unit_price,
         discount_amount, tax_amount, line_total
       )`
    )
    .eq("id", saleId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!sale) return null

  const [paymentsResult, refundsResult, paidResult, cashierResult] =
    await Promise.all([
      supabase
        .from("payments")
        .select(
          `id, amount, method, entry_type, notes, created_at, voided_at,
           void_reason, tendered_amount, change_amount, received_by`
        )
        .eq("reference_type", "sale")
        .eq("reference_id", saleId)
        .order("created_at", { ascending: true }),
      supabase
        .from("refunds")
        .select(
          `id, total, reason, created_at, created_by,
           refund_items(id, sale_item_id, product_id, quantity, amount)`
        )
        .eq("sale_id", saleId)
        .order("created_at", { ascending: false }),
      supabase.rpc("paid_total", {
        p_reference_type: "sale",
        p_reference_id: saleId,
      }),
      sale.created_by
        ? supabase
            .from("profiles")
            .select("id, first_name, last_name")
            .eq("id", sale.created_by)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ])

  if (paymentsResult.error) throw new Error(paymentsResult.error.message)
  if (refundsResult.error) throw new Error(refundsResult.error.message)

  return {
    sale,
    items: sale.sale_items ?? [],
    customer: Array.isArray(sale.customers) ? sale.customers[0] : sale.customers,
    payments: paymentsResult.data ?? [],
    refunds: refundsResult.data ?? [],
    paidTotal: Number(paidResult.data ?? 0),
    cashier: cashierResult.data,
  }
}

export async function getReceiptData(saleId: string) {
  const supabase = await createClient()
  const { data: sale, error } = await supabase
    .from("sales")
    .select(
      `id, sale_number, status, notes, shop_id, customer_id, created_by,
       subtotal, discount_amount, tax_amount, total, change_amount,
       created_at, completed_at,
       customers(id, first_name, last_name, phone, is_walk_in),
       sale_items(
         id, description_snapshot, quantity, unit_price,
         discount_amount, tax_amount, line_total
       )`
    )
    .eq("id", saleId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!sale) return null

  const [shopResult, settingsResult, paymentsResult, cashierResult] =
    await Promise.all([
      supabase
        .from("shops")
        .select("id, name, address, phone, email")
        .eq("id", sale.shop_id)
        .maybeSingle(),
      supabase
        .from("shop_settings")
        .select(
          "logo_path, tax_id, business_registration, receipt_footer, tax_label, currency_code, currency_locale, default_warranty_days"
        )
        .eq("shop_id", sale.shop_id)
        .maybeSingle(),
      supabase
        .from("payments")
        .select(
          "id, amount, method, entry_type, tendered_amount, change_amount, voided_at, created_at"
        )
        .eq("reference_type", "sale")
        .eq("reference_id", saleId)
        .is("voided_at", null)
        .order("created_at", { ascending: true }),
      sale.created_by
        ? supabase
            .from("profiles")
            .select("id, first_name, last_name")
            .eq("id", sale.created_by)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ])

  if (shopResult.error) throw new Error(shopResult.error.message)
  if (settingsResult.error) throw new Error(settingsResult.error.message)
  if (paymentsResult.error) throw new Error(paymentsResult.error.message)

  const logoUrl = await signShopAssetPath(settingsResult.data?.logo_path)

  return {
    sale,
    items: sale.sale_items ?? [],
    customer: Array.isArray(sale.customers) ? sale.customers[0] : sale.customers,
    shop: shopResult.data,
    settings: settingsResult.data
      ? { ...settingsResult.data, logo_url: logoUrl }
      : null,
    payments: paymentsResult.data ?? [],
    cashier: cashierResult.data,
  }
}

export async function computeSaleGrandTotal(options: {
  shopId: string
  items: { productId: string; quantity: number; discountAmount?: number }[]
  discountAmount?: number
}) {
  const supabase = await createClient()
  const productIds = [...new Set(options.items.map((i) => i.productId))]
  const { data: products, error } = await supabase
    .from("products")
    .select("id, selling_price, is_taxable, tax_rate_override, is_active, track_inventory")
    .in("id", productIds)

  if (error) throw new Error(error.message)
  const byId = new Map((products ?? []).map((p) => [p.id, p]))

  let subtotal = 0
  let taxTotal = 0

  for (const item of options.items) {
    const product = byId.get(item.productId)
    if (!product || !product.is_active) {
      throw new Error("Unknown product")
    }
    const { data: taxRows, error: taxError } = await supabase.rpc("line_tax", {
      p_shop_id: options.shopId,
      p_qty: item.quantity,
      p_unit_price: product.selling_price,
      p_discount: item.discountAmount ?? 0,
      p_is_taxable: product.is_taxable,
      // null = shop rate; do not coerce to 0 (that forces 0% tax)
      p_tax_override: (product.tax_rate_override ?? null) as number,
    })
    if (taxError) throw new Error(taxError.message)
    const taxRow = Array.isArray(taxRows) ? taxRows[0] : taxRows
    if (!taxRow) throw new Error("Could not calculate tax")
    subtotal = Math.round((subtotal + Number(taxRow.net_amount)) * 100) / 100
    taxTotal = Math.round((taxTotal + Number(taxRow.tax_amount)) * 100) / 100
  }

  const saleDiscount = options.discountAmount ?? 0
  let grand = Math.round((subtotal + taxTotal - saleDiscount) * 100) / 100
  if (grand < 0) grand = 0
  return { subtotal, taxTotal, grand }
}

export async function computeHeldSaleGrandTotal(
  saleId: string,
  discountAmount?: number
) {
  const supabase = await createClient()
  const { data: sale, error } = await supabase
    .from("sales")
    .select("id, discount_amount, sale_items(line_total, tax_amount)")
    .eq("id", saleId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!sale) throw new Error("Sale not found")

  const items = sale.sale_items ?? []
  let subtotal = 0
  let taxTotal = 0
  for (const item of items) {
    subtotal =
      Math.round((subtotal + Number(item.line_total) - Number(item.tax_amount)) * 100) /
      100
    taxTotal = Math.round((taxTotal + Number(item.tax_amount)) * 100) / 100
  }

  const saleDiscount =
    discountAmount != null ? discountAmount : Number(sale.discount_amount ?? 0)
  let grand = Math.round((subtotal + taxTotal - saleDiscount) * 100) / 100
  if (grand < 0) grand = 0
  return { subtotal, taxTotal, grand, discountAmount: saleDiscount }
}

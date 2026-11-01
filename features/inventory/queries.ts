import "server-only"

import {
  isProductType,
  isStockStatus,
  type InventoryMovementType,
  type ProductType,
  type StockStatus,
} from "@/lib/inventory/constants"
import { roundMoney } from "@/lib/money/currency"
import { PAGE_SIZE } from "@/lib/navigation/paths"
import { createClient } from "@/lib/supabase/server"
import { signShopAssetPaths } from "@/lib/storage/signed-urls"

export async function searchInventory(options: {
  shopId: string
  q?: string
  categoryId?: string
  productType?: string
  stockStatus?: string
  page?: number
}) {
  const page = Math.max(1, options.page ?? 1)
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1
  const supabase = await createClient()

  let query = supabase
    .from("shop_product_inventory")
    .select(
      `product_id, shop_id, sku, barcode, name, product_type, category_id,
       selling_price, min_stock, reorder_level, location_bin, is_active,
       track_inventory, quantity, stock_status, primary_image_path`,
      { count: "exact" }
    )
    .eq("shop_id", options.shopId)
    .eq("is_active", true)
    .eq("track_inventory", true)
    .order("name")
    .range(from, to)

  if (options.categoryId) query = query.eq("category_id", options.categoryId)
  if (options.productType && isProductType(options.productType)) {
    query = query.eq("product_type", options.productType as ProductType)
  }
  if (options.stockStatus && isStockStatus(options.stockStatus)) {
    query = query.eq("stock_status", options.stockStatus as StockStatus)
  }

  const q = options.q?.trim()
  if (q) {
    const pattern = `%${q}%`
    query = query.or(
      `name.ilike.${pattern},sku.ilike.${pattern},barcode.ilike.${pattern}`
    )
  }

  const { data, error, count } = await query
  if (error) throw new Error(error.message)

  const rows = data ?? []
  const categoryIds = [
    ...new Set(
      rows
        .map((r) => r.category_id)
        .filter((id): id is string => typeof id === "string")
    ),
  ]
  const { data: categories } = categoryIds.length
    ? await supabase.from("categories").select("id, name").in("id", categoryIds)
    : { data: [] as { id: string; name: string }[] }
  const categoryMap = new Map((categories ?? []).map((c) => [c.id, c.name]))
  const signed = await signShopAssetPaths(
    rows.map((r) => r.primary_image_path as string | null)
  )

  return {
    rows: rows.map((row) => ({
      ...row,
      product_id: row.product_id as string,
      category_name: row.category_id ? categoryMap.get(row.category_id) ?? null : null,
      primary_image_url: row.primary_image_path
        ? signed.get(row.primary_image_path as string) ?? null
        : null,
    })),
    total: count ?? 0,
    page,
    pageSize: PAGE_SIZE,
  }
}

export type ShopStockValue = {
  retailValue: number
  costValue: number | null
  units: number
}

/** Whole-shop stock value: selling price × quantity on hand, plus cost when recorded. */
export async function getShopStockValue(shopId: string): Promise<ShopStockValue> {
  const supabase = await createClient()
  const pageSize = 1000
  let from = 0
  let retailValue = 0
  let units = 0
  const qtyByProduct = new Map<string, number>()

  for (;;) {
    const { data, error } = await supabase
      .from("shop_product_inventory")
      .select("product_id, quantity, selling_price")
      .eq("shop_id", shopId)
      .eq("track_inventory", true)
      .range(from, from + pageSize - 1)

    if (error) throw new Error(error.message)
    const rows = data ?? []
    for (const row of rows) {
      const qty = Number(row.quantity ?? 0)
      if (!(qty > 0)) continue
      const productId = row.product_id as string
      retailValue += qty * Number(row.selling_price ?? 0)
      units += qty
      qtyByProduct.set(productId, (qtyByProduct.get(productId) ?? 0) + qty)
    }
    if (rows.length < pageSize) break
    from += pageSize
  }

  let costValue: number | null = null
  const productIds = [...qtyByProduct.keys()]
  if (productIds.length > 0) {
    let cost = 0
    let sawCost = false
    for (let index = 0; index < productIds.length; index += 200) {
      const batch = productIds.slice(index, index + 200)
      const { data: costs, error } = await supabase
        .from("product_costs")
        .select("product_id, cost_price")
        .in("product_id", batch)
      if (error) break
      for (const row of costs ?? []) {
        sawCost = true
        cost += Number(row.cost_price) * (qtyByProduct.get(row.product_id) ?? 0)
      }
    }
    if (sawCost) costValue = roundMoney(cost)
  }

  return {
    retailValue: roundMoney(retailValue),
    costValue,
    units,
  }
}

export async function searchInventoryMovements(options: {
  shopId?: string
  productId?: string
  movementType?: string
  fromDate?: string
  toDate?: string
  page?: number
}) {
  const page = Math.max(1, options.page ?? 1)
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1
  const supabase = await createClient()

  let query = supabase
    .from("inventory_movements")
    .select(
      `id, created_at, quantity_change, movement_type, reference_type, reference_id,
       notes, shop_id, product_id, created_by,
       products(id, name, sku),
       shops(id, name),
       profiles:created_by(id, first_name, last_name)`,
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(from, to)

  if (options.shopId) query = query.eq("shop_id", options.shopId)
  if (options.productId) query = query.eq("product_id", options.productId)
  if (options.movementType) {
    query = query.eq(
      "movement_type",
      options.movementType as InventoryMovementType
    )
  }
  if (options.fromDate) query = query.gte("created_at", options.fromDate)
  if (options.toDate) query = query.lte("created_at", `${options.toDate}T23:59:59.999Z`)

  const { data, error, count } = await query
  if (error) throw new Error(error.message)

  return {
    rows: data ?? [],
    total: count ?? 0,
    page,
    pageSize: PAGE_SIZE,
  }
}

import "server-only"

import {
  isProductType,
  isStockStatus,
  type InventoryMovementType,
  type ProductType,
  type StockStatus,
} from "@/lib/inventory/constants"
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

import "server-only"

import { canPerform } from "@/lib/auth/permissions"
import type { AppRole } from "@/lib/auth/roles"
import {
  isProductType,
  isStockStatus,
  type ProductType,
  type StockStatus,
} from "@/lib/inventory/constants"
import { PAGE_SIZE } from "@/lib/navigation/paths"
import { createClient } from "@/lib/supabase/server"
import { signShopAssetPaths } from "@/lib/storage/signed-urls"

export async function listCatalogLookups() {
  const supabase = await createClient()
  const [{ data: categories }, { data: brands }, { data: suppliers }] =
    await Promise.all([
      supabase
        .from("categories")
        .select("id, name, is_active")
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("brands")
        .select("id, name, is_active")
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("suppliers")
        .select("id, name, is_active")
        .eq("is_active", true)
        .order("name"),
    ])
  return {
    categories: categories ?? [],
    brands: brands ?? [],
    suppliers: suppliers ?? [],
  }
}

export async function searchProducts(options: {
  q?: string
  categoryId?: string
  brandId?: string
  productType?: string
  active?: "all" | "active" | "inactive"
  stockStatus?: string
  shopId: string
  page?: number
  includeCosts?: boolean
  role: AppRole
}) {
  const page = Math.max(1, options.page ?? 1)
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1
  const supabase = await createClient()
  const canCost = options.includeCosts && canPerform(options.role, "viewCostPrices")

  let query = supabase
    .from("shop_product_inventory")
    .select(
      `product_id, shop_id, sku, barcode, name, product_type, category_id, brand_id,
       selling_price, min_stock, reorder_level, location_bin, is_active, track_inventory,
       quantity, stock_status, primary_image_path`,
      { count: "exact" }
    )
    .eq("shop_id", options.shopId)
    .order("name")
    .range(from, to)

  if (options.active === "active") query = query.eq("is_active", true)
  if (options.active === "inactive") query = query.eq("is_active", false)
  if (options.categoryId) query = query.eq("category_id", options.categoryId)
  if (options.brandId) query = query.eq("brand_id", options.brandId)
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
  const brandIds = [
    ...new Set(
      rows
        .map((r) => r.brand_id)
        .filter((id): id is string => typeof id === "string")
    ),
  ]
  const productIds = rows
    .map((r) => r.product_id)
    .filter((id): id is string => typeof id === "string")

  const [categoriesRes, brandsRes, costsRes] = await Promise.all([
    categoryIds.length
      ? supabase.from("categories").select("id, name").in("id", categoryIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    brandIds.length
      ? supabase.from("brands").select("id, name").in("id", brandIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    canCost && productIds.length
      ? supabase
          .from("product_costs")
          .select("product_id, cost_price")
          .in("product_id", productIds)
      : Promise.resolve({ data: [] as { product_id: string; cost_price: number }[] }),
  ])

  const categoryMap = new Map((categoriesRes.data ?? []).map((c) => [c.id, c.name]))
  const brandMap = new Map((brandsRes.data ?? []).map((b) => [b.id, b.name]))
  const costMap = new Map(
    ((costsRes.data ?? []) as { product_id: string; cost_price: number }[]).map((c) => [
      c.product_id,
      c.cost_price,
    ])
  )

  const signed = await signShopAssetPaths(
    rows.map((r) => r.primary_image_path as string | null)
  )

  return {
    rows: rows.map((row) => ({
      ...row,
      product_id: row.product_id as string,
      category_name: row.category_id ? categoryMap.get(row.category_id) ?? null : null,
      brand_name: row.brand_id ? brandMap.get(row.brand_id) ?? null : null,
      cost_price: canCost ? (costMap.get(row.product_id as string) ?? null) : null,
      primary_image_url: row.primary_image_path
        ? signed.get(row.primary_image_path as string) ?? null
        : null,
    })),
    total: count ?? 0,
    page,
    pageSize: PAGE_SIZE,
  }
}

export async function getProductDetail(productId: string, role: AppRole, shopId: string) {
  const supabase = await createClient()
  const canCost = canPerform(role, "viewCostPrices")

  const { data: product, error } = await supabase
    .from("products")
    .select(
      `*,
       categories(id, name),
       brands(id, name),
       suppliers(id, name)`
    )
    .eq("id", productId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!product) return null

  const [stock, cost, compat, deviceCatalog, images] = await Promise.all([
    supabase
      .from("product_stocks")
      .select("shop_id, quantity, shops(id, name)")
      .eq("product_id", productId),
    canCost
      ? supabase
          .from("product_costs")
          .select("cost_price, updated_at")
          .eq("product_id", productId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("product_device_compatibility")
      .select(
        "device_model_id, device_models(id, name, device_brand_id, device_brands(id, name))"
      )
      .eq("product_id", productId),
    supabase
      .from("device_models")
      .select("id, name, device_brand_id, device_brands(id, name)")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("product_images")
      .select("id, storage_path, sort_order, is_primary, created_at")
      .eq("product_id", productId)
      .eq("shop_id", shopId)
      .order("sort_order")
      .order("created_at"),
  ])

  const inventory = await supabase
    .from("shop_product_inventory")
    .select("quantity, stock_status, reorder_level, min_stock, primary_image_path")
    .eq("product_id", productId)
    .eq("shop_id", shopId)
    .maybeSingle()

  const imageRows = images.data ?? []
  const signed = await signShopAssetPaths(imageRows.map((i) => i.storage_path))

  return {
    product,
    stocks: stock.data ?? [],
    cost: canCost ? cost.data : null,
    compatibility: compat.data ?? [],
    deviceModels: deviceCatalog.data ?? [],
    shopInventory: inventory.data,
    images: imageRows.map((img) => ({
      ...img,
      url: signed.get(img.storage_path) ?? null,
    })),
  }
}

export async function searchProductsQuick(q: string, limit = 20) {
  const supabase = await createClient()
  const pattern = `%${q.trim()}%`
  const { data, error } = await supabase
    .from("products")
    .select("id, name, sku, barcode, selling_price, product_type, track_inventory, is_active")
    .eq("is_active", true)
    .or(`name.ilike.${pattern},sku.ilike.${pattern},barcode.ilike.${pattern}`)
    .order("name")
    .limit(limit)
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function findProductByBarcode(barcode: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("products")
    .select("id, name, sku, barcode, selling_price, product_type")
    .eq("barcode", barcode.trim())
    .eq("is_active", true)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"

import { canAccess, canPerform } from "@/lib/auth/permissions"
import { requireWorkspaceSession } from "@/lib/auth/workspace"
import {
  defaultTrackInventory,
  isProductType,
  type ProductType,
} from "@/lib/inventory/constants"
import { productPath } from "@/lib/navigation/feature-paths"
import { APP_ROUTES } from "@/lib/navigation/paths"
import { createClient } from "@/lib/supabase/server"

export type ActionResult = { error: string } | { success: string; id?: string }

const productSchema = z.object({
  name: z.string().trim().min(1).max(160),
  sku: z.string().trim().min(1).max(64),
  barcode: z.string().trim().max(64).optional().or(z.literal("")),
  productType: z.enum(["phone", "accessory", "spare_part", "other", "service"]),
  categoryId: z.string().uuid().optional().or(z.literal("")),
  brandId: z.string().uuid().optional().or(z.literal("")),
  supplierId: z.string().uuid().optional().or(z.literal("")),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  sellingPrice: z.coerce.number().min(0),
  isTaxable: z.boolean().default(true),
  taxRateOverride: z.coerce.number().min(0).max(1).optional().nullable(),
  trackInventory: z.boolean().optional(),
  minStock: z.coerce.number().min(0).default(0),
  reorderLevel: z.coerce.number().min(0).default(0),
  locationBin: z.string().trim().max(64).optional().or(z.literal("")),
  isActive: z.boolean().default(true),
  costPrice: z.coerce.number().min(0).optional().nullable(),
  newCategoryName: z.string().trim().max(80).optional().or(z.literal("")),
  newBrandName: z.string().trim().max(80).optional().or(z.literal("")),
})

function uniquenessMessage(message: string): string {
  const lower = message.toLowerCase()
  if (lower.includes("sku") || lower.includes("products_organization_id_sku")) {
    return "A product with this SKU already exists."
  }
  if (lower.includes("barcode")) {
    return "A product with this barcode already exists."
  }
  return message
}

async function resolveCategoryBrand(
  orgId: string,
  data: z.infer<typeof productSchema>
) {
  const supabase = await createClient()
  let categoryId = data.categoryId || null
  let brandId = data.brandId || null

  if (data.newCategoryName) {
    const { data: cat, error } = await supabase
      .from("categories")
      .insert({ organization_id: orgId, name: data.newCategoryName })
      .select("id")
      .single()
    if (error || !cat) throw new Error(error?.message ?? "Could not create category.")
    categoryId = cat.id
  }

  if (data.newBrandName) {
    const { data: brand, error } = await supabase
      .from("brands")
      .insert({ organization_id: orgId, name: data.newBrandName })
      .select("id")
      .single()
    if (error || !brand) throw new Error(error?.message ?? "Could not create brand.")
    brandId = brand.id
  }

  return { categoryId, brandId }
}

export async function createProductAction(input: unknown): Promise<ActionResult> {
  const session = await requireWorkspaceSession()
  if (!canAccess(session.role, "products")) {
    return { error: "You cannot manage products." }
  }

  const parsed = productSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check product details." }
  }

  const data = parsed.data
  const type = data.productType as ProductType
  const track = data.trackInventory ?? defaultTrackInventory(type)

  let categoryId: string | null
  let brandId: string | null
  try {
    const resolved = await resolveCategoryBrand(session.organization.id, data)
    categoryId = resolved.categoryId
    brandId = resolved.brandId
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create product." }
  }

  const supabase = await createClient()

  if (data.barcode) {
    const { data: existingBarcode } = await supabase
      .from("products")
      .select("id")
      .eq("barcode", data.barcode)
      .maybeSingle()
    if (existingBarcode) {
      return { error: "A product with this barcode already exists." }
    }
  }

  const { data: product, error } = await supabase
    .from("products")
    .insert({
      organization_id: session.organization.id,
      name: data.name,
      sku: data.sku,
      barcode: data.barcode || null,
      product_type: type,
      category_id: categoryId,
      brand_id: brandId,
      supplier_id: data.supplierId || null,
      description: data.description || null,
      selling_price: data.sellingPrice,
      is_taxable: data.isTaxable,
      tax_rate_override: data.taxRateOverride ?? null,
      track_inventory: track,
      min_stock: data.minStock,
      reorder_level: data.reorderLevel,
      location_bin: data.locationBin || null,
      is_active: data.isActive,
    })
    .select("id")
    .single()

  if (error || !product) {
    return { error: uniquenessMessage(error?.message ?? "Could not create product.") }
  }

  if (
    canPerform(session.role, "viewCostPrices") &&
    data.costPrice != null &&
    Number.isFinite(data.costPrice)
  ) {
    const { error: costError } = await supabase.from("product_costs").insert({
      product_id: product.id,
      organization_id: session.organization.id,
      cost_price: data.costPrice,
      updated_by: session.userId,
    })
    if (costError) {
      return {
        error: `Product created, but cost could not be saved: ${costError.message}`,
        id: product.id,
      }
    }
  }

  revalidatePath(APP_ROUTES.products)
  redirect(productPath(product.id))
}

export async function updateProductAction(
  productId: string,
  input: unknown
): Promise<ActionResult> {
  const session = await requireWorkspaceSession()
  if (!canAccess(session.role, "products")) {
    return { error: "You cannot manage products." }
  }

  const parsed = productSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check product details." }
  }

  const data = parsed.data
  const type = isProductType(data.productType) ? data.productType : "accessory"
  const track = data.trackInventory ?? defaultTrackInventory(type)

  try {
    const { categoryId, brandId } = await resolveCategoryBrand(
      session.organization.id,
      data
    )
    const supabase = await createClient()

    if (data.barcode) {
      const { data: existingBarcode } = await supabase
        .from("products")
        .select("id")
        .eq("barcode", data.barcode)
        .neq("id", productId)
        .maybeSingle()
      if (existingBarcode) {
        return { error: "A product with this barcode already exists." }
      }
    }

    const { error } = await supabase
      .from("products")
      .update({
        name: data.name,
        sku: data.sku,
        barcode: data.barcode || null,
        product_type: type,
        category_id: categoryId,
        brand_id: brandId,
        supplier_id: data.supplierId || null,
        description: data.description || null,
        selling_price: data.sellingPrice,
        is_taxable: data.isTaxable,
        tax_rate_override: data.taxRateOverride ?? null,
        track_inventory: track,
        min_stock: data.minStock,
        reorder_level: data.reorderLevel,
        location_bin: data.locationBin || null,
        is_active: data.isActive,
      })
      .eq("id", productId)

    if (error) {
      return { error: uniquenessMessage(error.message) }
    }

    if (
      canPerform(session.role, "viewCostPrices") &&
      data.costPrice != null &&
      Number.isFinite(data.costPrice)
    ) {
      const { error: costError } = await supabase.from("product_costs").upsert({
        product_id: productId,
        organization_id: session.organization.id,
        cost_price: data.costPrice,
        updated_by: session.userId,
      })
      if (costError) {
        return { error: `Product saved, but cost could not be updated: ${costError.message}` }
      }
    }

    revalidatePath(productPath(productId))
    revalidatePath(APP_ROUTES.products)
    revalidatePath(APP_ROUTES.inventory)
    return { success: "Product updated." }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update product." }
  }
}

export async function setProductCompatibilityAction(input: {
  productId: string
  deviceModelIds: string[]
}): Promise<ActionResult> {
  const session = await requireWorkspaceSession()
  if (!canAccess(session.role, "products")) {
    return { error: "You cannot manage compatibility." }
  }

  const supabase = await createClient()
  const { data: product } = await supabase
    .from("products")
    .select("id")
    .eq("id", input.productId)
    .maybeSingle()
  if (!product) return { error: "Product not found." }

  const { error: delError } = await supabase
    .from("product_device_compatibility")
    .delete()
    .eq("product_id", input.productId)
  if (delError) return { error: delError.message }

  const uniqueIds = [...new Set(input.deviceModelIds.filter(Boolean))]
  if (uniqueIds.length > 0) {
    const rows = uniqueIds.map((device_model_id) => ({
      organization_id: session.organization.id,
      product_id: input.productId,
      device_model_id,
    }))
    const { error } = await supabase.from("product_device_compatibility").insert(rows)
    if (error) return { error: error.message }
  }

  revalidatePath(productPath(input.productId))
  return { success: "Compatibility updated." }
}

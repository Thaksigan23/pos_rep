"use server"

import { revalidatePath } from "next/cache"

import { canPerform } from "@/lib/auth/permissions"
import { requireWorkspaceSession } from "@/lib/auth/workspace"
import { productPath } from "@/lib/navigation/feature-paths"
import { APP_ROUTES } from "@/lib/navigation/paths"
import { createClient } from "@/lib/supabase/server"

export type ActionResult = { error: string } | { success: string }

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/svg+xml"]
const MAX_BYTES = 5 * 1024 * 1024
const MAX_IMAGES = 5

function extForMime(mime: string, filename: string) {
  const fromName = filename.split(".").pop()?.toLowerCase()
  if (fromName && ["jpg", "jpeg", "png", "webp", "svg"].includes(fromName)) {
    return fromName === "jpeg" ? "jpg" : fromName
  }
  if (mime === "image/png") return "png"
  if (mime === "image/webp") return "webp"
  if (mime === "image/svg+xml") return "svg"
  return "jpg"
}

export async function uploadProductImageAction(
  formData: FormData
): Promise<ActionResult> {
  const session = await requireWorkspaceSession()
  if (session.role !== "owner" && session.role !== "admin") {
    return { error: "Only owners and admins can manage product images." }
  }

  const productId = String(formData.get("productId") ?? "")
  const file = formData.get("file")
  if (!productId || !(file instanceof File)) {
    return { error: "Product and image file are required." }
  }
  if (!ALLOWED_MIME.includes(file.type)) {
    return { error: "Only JPEG, PNG, WebP, or SVG images are allowed." }
  }
  if (file.size > MAX_BYTES) {
    return { error: "Image must be 5MB or smaller." }
  }

  const supabase = await createClient()
  const { data: product } = await supabase
    .from("products")
    .select("id, organization_id")
    .eq("id", productId)
    .maybeSingle()
  if (!product) return { error: "Product not found." }

  const { count } = await supabase
    .from("product_images")
    .select("id", { count: "exact", head: true })
    .eq("product_id", productId)
    .eq("shop_id", session.shop.id)

  if ((count ?? 0) >= MAX_IMAGES) {
    return { error: "Maximum of 5 images per product." }
  }

  const ext = extForMime(file.type, file.name)
  const objectPath = `${product.organization_id}/${session.shop.id}/products/${productId}/${crypto.randomUUID()}.${ext}`
  const bytes = new Uint8Array(await file.arrayBuffer())

  const { error: uploadError } = await supabase.storage
    .from("shop-assets")
    .upload(objectPath, bytes, { contentType: file.type, upsert: false })
  if (uploadError) return { error: uploadError.message }

  const isPrimary = (count ?? 0) === 0
  const { error: metaError } = await supabase.from("product_images").insert({
    organization_id: product.organization_id,
    shop_id: session.shop.id,
    product_id: productId,
    storage_path: objectPath,
    sort_order: count ?? 0,
    is_primary: isPrimary,
  })

  if (metaError) {
    await supabase.storage.from("shop-assets").remove([objectPath])
    return { error: metaError.message }
  }

  revalidatePath(productPath(productId))
  revalidatePath(APP_ROUTES.products)
  revalidatePath(APP_ROUTES.inventory)
  revalidatePath(APP_ROUTES.pos)
  return { success: "Image uploaded." }
}

export async function setPrimaryProductImageAction(
  imageId: string,
  productId: string
): Promise<ActionResult> {
  const session = await requireWorkspaceSession()
  if (session.role !== "owner" && session.role !== "admin") {
    return { error: "Only owners and admins can manage product images." }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc("set_primary_product_image", {
    p_image_id: imageId,
  })
  if (error) return { error: error.message }

  revalidatePath(productPath(productId))
  revalidatePath(APP_ROUTES.products)
  revalidatePath(APP_ROUTES.inventory)
  revalidatePath(APP_ROUTES.pos)
  return { success: "Primary image updated." }
}

export async function deleteProductImageAction(
  imageId: string,
  productId: string
): Promise<ActionResult> {
  const session = await requireWorkspaceSession()
  if (session.role !== "owner" && session.role !== "admin") {
    return { error: "Only owners and admins can manage product images." }
  }

  const supabase = await createClient()
  const { data: authz, error: authzError } = await supabase.rpc(
    "authorize_product_image_deletion",
    { p_image_id: imageId }
  )
  if (authzError || !authz?.[0]?.storage_path) {
    return { error: authzError?.message ?? "Image not found or not authorized." }
  }

  const trustedPath = authz[0].storage_path as string
  const { error: storageError } = await supabase.storage
    .from("shop-assets")
    .remove([trustedPath])
  if (storageError) {
    return { error: `Storage delete failed: ${storageError.message}` }
  }

  const { error: deleteError } = await supabase.rpc("delete_product_image", {
    p_image_id: imageId,
  })
  if (deleteError) {
    return {
      error: `Metadata delete failed after storage removal: ${deleteError.message}`,
    }
  }

  revalidatePath(productPath(productId))
  revalidatePath(APP_ROUTES.products)
  revalidatePath(APP_ROUTES.inventory)
  revalidatePath(APP_ROUTES.pos)
  return { success: "Image deleted." }
}

export async function uploadShopLogoAction(
  formData: FormData
): Promise<ActionResult> {
  const session = await requireWorkspaceSession()
  if (!canPerform(session.role, "manageSettings")) {
    return { error: "Only owners and admins can update the shop logo." }
  }

  const file = formData.get("file")
  if (!(file instanceof File)) return { error: "Logo file is required." }
  if (!ALLOWED_MIME.includes(file.type)) {
    return { error: "Only JPEG, PNG, WebP, or SVG images are allowed." }
  }
  if (file.size > MAX_BYTES) {
    return { error: "Logo must be 5MB or smaller." }
  }

  const supabase = await createClient()
  const ext = extForMime(file.type, file.name)
  const objectPath = `${session.organization.id}/${session.shop.id}/branding/logo.${ext}`
  const bytes = new Uint8Array(await file.arrayBuffer())

  const { data: settings } = await supabase
    .from("shop_settings")
    .select("logo_path")
    .eq("shop_id", session.shop.id)
    .maybeSingle()

  const { error: uploadError } = await supabase.storage
    .from("shop-assets")
    .upload(objectPath, bytes, { contentType: file.type, upsert: true })
  if (uploadError) return { error: uploadError.message }

  const { error } = await supabase.rpc("set_shop_logo_path", {
    p_shop_id: session.shop.id,
    p_logo_path: objectPath,
  })
  if (error) {
    return { error: error.message }
  }

  if (
    settings?.logo_path &&
    settings.logo_path !== objectPath
  ) {
    await supabase.storage.from("shop-assets").remove([settings.logo_path])
  }

  revalidatePath(APP_ROUTES.settings)
  revalidatePath(APP_ROUTES.sales)
  return { success: "Shop logo updated." }
}

export async function removeShopLogoAction(): Promise<ActionResult> {
  const session = await requireWorkspaceSession()
  if (!canPerform(session.role, "manageSettings")) {
    return { error: "Only owners and admins can update the shop logo." }
  }

  const supabase = await createClient()
  const { data: settings } = await supabase
    .from("shop_settings")
    .select("logo_path")
    .eq("shop_id", session.shop.id)
    .maybeSingle()

  const previous = settings?.logo_path
  const { error } = await supabase.rpc("set_shop_logo_path", {
    p_shop_id: session.shop.id,
    p_logo_path: null,
  })
  if (error) return { error: error.message }

  if (previous) {
    await supabase.storage.from("shop-assets").remove([previous])
  }

  revalidatePath(APP_ROUTES.settings)
  revalidatePath(APP_ROUTES.sales)
  return { success: "Shop logo removed." }
}

import "server-only"

import { createClient } from "@/lib/supabase/server"

const SIGNED_TTL_SECONDS = 3600

/**
 * Batch-create signed URLs for private shop-assets paths.
 * Returns a map of storage_path → signed URL (missing/failed paths omitted).
 */
export async function signShopAssetPaths(
  paths: Array<string | null | undefined>
): Promise<Map<string, string>> {
  const unique = [
    ...new Set(
      paths.filter((p): p is string => typeof p === "string" && p.length > 0)
    ),
  ]
  const out = new Map<string, string>()
  if (unique.length === 0) return out

  const supabase = await createClient()
  // Supabase supports createSignedUrls for batching.
  const { data, error } = await supabase.storage
    .from("shop-assets")
    .createSignedUrls(unique, SIGNED_TTL_SECONDS)

  if (error || !data) return out

  for (const row of data) {
    if (row.path && row.signedUrl && !row.error) {
      out.set(row.path, row.signedUrl)
    }
  }
  return out
}

export async function signShopAssetPath(
  path: string | null | undefined
): Promise<string | null> {
  if (!path) return null
  const map = await signShopAssetPaths([path])
  return map.get(path) ?? null
}

/**
 * Batch-create signed URLs for private repair-photos paths.
 */
export async function signRepairPhotoPaths(
  paths: Array<string | null | undefined>
): Promise<Map<string, string>> {
  const unique = [
    ...new Set(
      paths.filter((p): p is string => typeof p === "string" && p.length > 0)
    ),
  ]
  const out = new Map<string, string>()
  if (unique.length === 0) return out

  const supabase = await createClient()
  const { data, error } = await supabase.storage
    .from("repair-photos")
    .createSignedUrls(unique, SIGNED_TTL_SECONDS)

  if (error || !data) return out

  for (const row of data) {
    if (row.path && row.signedUrl && !row.error) {
      out.set(row.path, row.signedUrl)
    }
  }
  return out
}

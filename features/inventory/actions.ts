"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { canPerform } from "@/lib/auth/permissions"
import { requireWorkspaceSession } from "@/lib/auth/workspace"
import { ADJUSTMENT_MOVEMENT_TYPES } from "@/lib/inventory/constants"
import { inventoryMovementsPath, productPath } from "@/lib/navigation/feature-paths"
import { APP_ROUTES } from "@/lib/navigation/paths"
import { createClient } from "@/lib/supabase/server"
import type { Database } from "@/types/database"

export type ActionResult =
  | { error: string }
  | { success: string; movementId?: string; quantity?: number }

const adjustSchema = z.object({
  productId: z.string().uuid(),
  shopId: z.string().uuid(),
  quantityChange: z.coerce.number().refine((n) => n !== 0, "Quantity cannot be zero"),
  movementType: z.enum([
    "adjustment",
    "damaged",
    "stock_count",
    "stock_count_correction",
  ]),
  notes: z.string().trim().min(1, "Reason/notes are required").max(500),
})

export async function adjustInventoryAction(input: unknown): Promise<ActionResult> {
  const session = await requireWorkspaceSession()
  if (!canPerform(session.role, "adjustInventory")) {
    return { error: "Only owners and admins can adjust inventory." }
  }

  const parsed = adjustSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check adjustment details." }
  }

  if (
    !ADJUSTMENT_MOVEMENT_TYPES.includes(
      parsed.data.movementType as (typeof ADJUSTMENT_MOVEMENT_TYPES)[number]
    )
  ) {
    return { error: "Invalid adjustment type." }
  }

  if (!session.accessibleShops.some((s) => s.id === parsed.data.shopId)) {
    return { error: "Shop access denied." }
  }

  const supabase = await createClient()
  const { data: movementId, error } = await supabase.rpc("adjust_inventory", {
    p_shop_id: parsed.data.shopId,
    p_product_id: parsed.data.productId,
    p_quantity_change: parsed.data.quantityChange,
    p_movement_type:
      parsed.data.movementType as Database["public"]["Enums"]["inventory_movement_type"],
    p_notes: parsed.data.notes,
  })

  if (error || !movementId) {
    return { error: error?.message ?? "Adjustment failed." }
  }

  const { data: stock } = await supabase
    .from("product_stocks")
    .select("quantity")
    .eq("product_id", parsed.data.productId)
    .eq("shop_id", parsed.data.shopId)
    .maybeSingle()

  revalidatePath(APP_ROUTES.inventory)
  revalidatePath(inventoryMovementsPath())
  revalidatePath(productPath(parsed.data.productId))
  revalidatePath(APP_ROUTES.products)

  return {
    success: "Stock adjusted.",
    movementId,
    quantity: stock ? Number(stock.quantity) : undefined,
  }
}

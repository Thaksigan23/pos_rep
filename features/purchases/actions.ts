"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"

import { canAccess, canPerform } from "@/lib/auth/permissions"
import { requireWorkspaceSession } from "@/lib/auth/workspace"
import { purchasePath } from "@/lib/navigation/feature-paths"
import { APP_ROUTES } from "@/lib/navigation/paths"
import { createClient } from "@/lib/supabase/server"
import type { Json } from "@/types/database"

export type ActionResult = { error: string } | { success: string; id?: string }

const createPurchaseSchema = z.object({
  supplierId: z.string().uuid(),
  shopId: z.string().uuid(),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
  items: z
    .array(
      z.object({
        product_id: z.string().uuid(),
        quantity_ordered: z.coerce.number().positive(),
        unit_cost: z.coerce.number().min(0),
      })
    )
    .min(1, "Add at least one line"),
})

export async function createPurchaseAction(input: unknown): Promise<ActionResult> {
  const session = await requireWorkspaceSession()
  if (!canAccess(session.role, "purchases") || !canPerform(session.role, "managePurchases")) {
    return { error: "You cannot create purchases." }
  }

  const parsed = createPurchaseSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check purchase details." }
  }

  if (!session.accessibleShops.some((s) => s.id === parsed.data.shopId)) {
    return { error: "Shop access denied." }
  }

  const payload: Json = {
    shop_id: parsed.data.shopId,
    supplier_id: parsed.data.supplierId,
    notes: parsed.data.notes || null,
    items: parsed.data.items,
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("create_purchase", { p_payload: payload })
  if (error || !data) {
    return { error: error?.message ?? "Could not create purchase." }
  }

  revalidatePath(APP_ROUTES.purchases)
  redirect(purchasePath(data))
}

const receiveSchema = z.object({
  purchaseId: z.string().uuid(),
  items: z
    .array(
      z.object({
        purchase_item_id: z.string().uuid(),
        quantity: z.coerce.number().positive(),
      })
    )
    .min(1),
})

export async function receivePurchaseAction(input: unknown): Promise<ActionResult> {
  const session = await requireWorkspaceSession()
  if (!canPerform(session.role, "managePurchases")) {
    return { error: "You cannot receive purchases." }
  }

  const parsed = receiveSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check receive quantities." }
  }

  const payload: Json = {
    purchase_id: parsed.data.purchaseId,
    items: parsed.data.items,
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("receive_purchase", { p_payload: payload })
  if (error || !data) {
    return { error: error?.message ?? "Receive failed." }
  }

  revalidatePath(purchasePath(parsed.data.purchaseId))
  revalidatePath(APP_ROUTES.purchases)
  revalidatePath(APP_ROUTES.inventory)
  return { success: "Purchase received into stock." }
}

export async function receiveAllRemainingAction(
  purchaseId: string
): Promise<ActionResult> {
  const session = await requireWorkspaceSession()
  if (!canPerform(session.role, "managePurchases")) {
    return { error: "You cannot receive purchases." }
  }

  const supabase = await createClient()
  const { data: items, error: itemsError } = await supabase
    .from("purchase_items")
    .select("id, quantity_ordered, quantity_received")
    .eq("purchase_id", purchaseId)

  if (itemsError) return { error: itemsError.message }

  const remaining = (items ?? [])
    .map((item) => ({
      purchase_item_id: item.id,
      quantity: Number(item.quantity_ordered) - Number(item.quantity_received),
    }))
    .filter((item) => item.quantity > 0)

  if (remaining.length === 0) {
    return { error: "Nothing left to receive." }
  }

  return receivePurchaseAction({ purchaseId, items: remaining })
}

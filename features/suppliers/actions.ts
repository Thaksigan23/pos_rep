"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"

import { canAccess } from "@/lib/auth/permissions"
import { requireWorkspaceSession } from "@/lib/auth/workspace"
import { supplierPath } from "@/lib/navigation/feature-paths"
import { APP_ROUTES } from "@/lib/navigation/paths"
import { createClient } from "@/lib/supabase/server"

export type ActionResult = { error: string } | { success: string; id?: string }

const supplierSchema = z.object({
  name: z.string().trim().min(1).max(120),
  contactPerson: z.string().trim().max(120).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  email: z.string().trim().email().optional().or(z.literal("")),
  address: z.string().trim().max(240).optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
  isActive: z.boolean().default(true),
})

export async function createSupplierAction(input: unknown): Promise<ActionResult> {
  const session = await requireWorkspaceSession()
  if (!canAccess(session.role, "suppliers")) {
    return { error: "You cannot manage suppliers." }
  }

  const parsed = supplierSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check supplier details." }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("suppliers")
    .insert({
      organization_id: session.organization.id,
      name: parsed.data.name,
      contact_person: parsed.data.contactPerson || null,
      phone: parsed.data.phone || null,
      email: parsed.data.email || null,
      address: parsed.data.address || null,
      notes: parsed.data.notes || null,
      is_active: parsed.data.isActive,
    })
    .select("id")
    .single()

  if (error || !data) {
    return { error: error?.message ?? "Could not create supplier." }
  }

  revalidatePath(APP_ROUTES.suppliers)
  redirect(supplierPath(data.id))
}

export async function updateSupplierAction(
  supplierId: string,
  input: unknown
): Promise<ActionResult> {
  const session = await requireWorkspaceSession()
  if (!canAccess(session.role, "suppliers")) {
    return { error: "You cannot manage suppliers." }
  }

  const parsed = supplierSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check supplier details." }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from("suppliers")
    .update({
      name: parsed.data.name,
      contact_person: parsed.data.contactPerson || null,
      phone: parsed.data.phone || null,
      email: parsed.data.email || null,
      address: parsed.data.address || null,
      notes: parsed.data.notes || null,
      is_active: parsed.data.isActive,
    })
    .eq("id", supplierId)

  if (error) return { error: error.message }
  revalidatePath(supplierPath(supplierId))
  revalidatePath(APP_ROUTES.suppliers)
  return { success: "Supplier updated." }
}

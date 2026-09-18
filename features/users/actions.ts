"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"

import { canPerform } from "@/lib/auth/permissions"
import { requireWorkspaceSession } from "@/lib/auth/workspace"
import { userPath } from "@/lib/navigation/feature-paths"
import { APP_ROUTES } from "@/lib/navigation/paths"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import type { Json } from "@/types/database"

export type ActionResult = { error: string } | { success: string; id?: string }

const staffRoles = ["admin", "cashier", "technician"] as const

const createSchema = z.object({
  email: z.string().trim().email("Valid email required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().max(80).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  role: z.enum(staffRoles),
  shopIds: z.array(z.string().uuid()).default([]),
  defaultShopId: z.string().uuid().optional(),
})

const updateSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().max(80).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  role: z.enum(staffRoles).optional(),
  isActive: z.boolean(),
  defaultShopId: z.string().uuid().optional().nullable(),
})

const membershipSchema = z.object({
  userId: z.string().uuid(),
  shopIds: z.array(z.string().uuid()),
})

export async function createStaffAction(input: unknown): Promise<ActionResult> {
  const session = await requireWorkspaceSession()
  if (!canPerform(session.role, "manageUsers")) {
    return { error: "Only owners and admins can create staff." }
  }

  const parsed = createSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check staff details." }
  }

  const d = parsed.data
  if (
    (d.role === "cashier" || d.role === "technician") &&
    d.shopIds.length === 0
  ) {
    return { error: "Cashiers and technicians need at least one shop." }
  }

  const defaultShopId = d.defaultShopId ?? d.shopIds[0] ?? session.shop.id

  let createdUserId: string | undefined
  const admin = createAdminClient()

  try {
    const { data: created, error: createError } =
      await admin.auth.admin.createUser({
        email: d.email,
        password: d.password,
        email_confirm: true,
      })

    if (createError || !created.user) {
      return {
        error: createError?.message ?? "Could not create auth user.",
      }
    }
    createdUserId = created.user.id

    const supabase = await createClient()
    const { error: assignError } = await supabase.rpc("assign_staff_profile", {
      p_user_id: createdUserId,
      p_role: d.role,
      p_shop_id: defaultShopId,
      p_first_name: d.firstName,
      p_last_name: d.lastName || undefined,
    })

    if (assignError) {
      await admin.auth.admin.deleteUser(createdUserId)
      createdUserId = undefined
      return { error: assignError.message }
    }

    if (d.phone) {
      await supabase.rpc("update_staff_profile", {
        p_user_id: createdUserId,
        p_payload: { phone: d.phone },
      })
    }

    const membershipShops =
      d.shopIds.length > 0 ? d.shopIds : [defaultShopId]
    const { error: memberError } = await supabase.rpc(
      "set_staff_shop_memberships",
      {
        p_user_id: createdUserId,
        p_shop_ids: membershipShops,
      }
    )

    if (memberError) {
      revalidatePath(APP_ROUTES.users)
      return {
        error: `Staff created but shop membership failed: ${memberError.message}`,
        id: createdUserId,
      }
    }

    revalidatePath(APP_ROUTES.users)
  } catch (e) {
    if (createdUserId) {
      try {
        await admin.auth.admin.deleteUser(createdUserId)
      } catch {
        // best-effort cleanup when profile assign failed mid-flight
      }
    }
    return {
      error: e instanceof Error ? e.message : "Could not create staff.",
    }
  }

  if (!createdUserId) {
    return { error: "Could not create staff." }
  }
  redirect(userPath(createdUserId))
}

export async function updateStaffAction(
  userId: string,
  input: unknown
): Promise<ActionResult> {
  const session = await requireWorkspaceSession()
  if (!canPerform(session.role, "manageUsers")) {
    return { error: "Only owners and admins can update staff." }
  }

  const parsed = updateSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check staff details." }
  }

  const d = parsed.data
  const payload: Json = {
    first_name: d.firstName,
    last_name: d.lastName || "",
    phone: d.phone || "",
    is_active: d.isActive,
    ...(d.defaultShopId ? { default_shop_id: d.defaultShopId } : {}),
    ...(userId !== session.userId && d.role ? { role: d.role } : {}),
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc("update_staff_profile", {
    p_user_id: userId,
    p_payload: payload,
  })

  if (error) {
    const msg = error.message.toLowerCase()
    if (msg.includes("cannot change their own role")) {
      return { error: "You cannot change your own role." }
    }
    if (msg.includes("cannot assign owner")) {
      return { error: "Cannot assign the owner role." }
    }
    if (msg.includes("admin cannot change")) {
      return { error: "Admins cannot change this role." }
    }
    return { error: error.message }
  }

  revalidatePath(APP_ROUTES.users)
  revalidatePath(userPath(userId))
  return { success: "Staff updated." }
}

export async function setStaffMembershipsAction(
  input: unknown
): Promise<ActionResult> {
  const session = await requireWorkspaceSession()
  if (!canPerform(session.role, "manageUsers")) {
    return { error: "Only owners and admins can update memberships." }
  }

  const parsed = membershipSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check shop selection." }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc("set_staff_shop_memberships", {
    p_user_id: parsed.data.userId,
    p_shop_ids: parsed.data.shopIds,
  })

  if (error) {
    return { error: error.message }
  }

  revalidatePath(APP_ROUTES.users)
  revalidatePath(userPath(parsed.data.userId))
  return { success: "Shop memberships updated." }
}

"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { canAccess } from "@/lib/auth/permissions"
import { requireWorkspaceSession } from "@/lib/auth/workspace"
import { isWarrantyClaimStatus } from "@/lib/warranties/constants"
import { warrantyPath } from "@/lib/navigation/feature-paths"
import { APP_ROUTES } from "@/lib/navigation/paths"
import { createClient } from "@/lib/supabase/server"
import type { Json } from "@/types/database"

export type ActionResult = { error: string } | { success: string; id?: string }

const claimSchema = z.object({
  warrantyId: z.string().uuid(),
  description: z.string().trim().min(1, "Description is required").max(2000),
  relatedRepairJobId: z.string().uuid().optional().or(z.literal("")),
})

const resolveSchema = z.object({
  status: z.string().refine(isWarrantyClaimStatus, "Invalid claim status"),
  resolution: z.string().trim().max(2000).optional().or(z.literal("")),
  relatedRepairJobId: z.string().uuid().optional().or(z.literal("")),
})

export async function createWarrantyClaimAction(
  input: unknown
): Promise<ActionResult> {
  const session = await requireWorkspaceSession()
  if (!canAccess(session.role, "warranties")) {
    return { error: "You cannot file warranty claims." }
  }

  const parsed = claimSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check claim details." }
  }

  const payload: Json = {
    warranty_id: parsed.data.warrantyId,
    description: parsed.data.description,
    related_repair_job_id: parsed.data.relatedRepairJobId || null,
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("create_warranty_claim", {
    p_payload: payload,
  })

  if (error || !data) {
    return { error: error?.message ?? "Could not create claim." }
  }

  revalidatePath(warrantyPath(parsed.data.warrantyId))
  revalidatePath(APP_ROUTES.warranties)
  return { success: "Claim filed.", id: data }
}

export async function resolveWarrantyClaimAction(
  claimId: string,
  warrantyId: string,
  input: unknown
): Promise<ActionResult> {
  const session = await requireWorkspaceSession()
  if (session.role !== "owner" && session.role !== "admin") {
    return { error: "Only owners and admins can resolve claims." }
  }

  const parsed = resolveSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check resolution details." }
  }

  const payload: Json = {
    status: parsed.data.status,
    resolution: parsed.data.resolution || null,
    related_repair_job_id: parsed.data.relatedRepairJobId || null,
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc("resolve_warranty_claim", {
    p_claim_id: claimId,
    p_payload: payload,
  })

  if (error) return { error: error.message }

  revalidatePath(warrantyPath(warrantyId))
  revalidatePath(APP_ROUTES.warranties)
  return { success: "Claim updated." }
}

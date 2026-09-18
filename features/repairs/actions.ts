"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"

import { canAccess, canPerform } from "@/lib/auth/permissions"
import { requireWorkspaceSession } from "@/lib/auth/workspace"
import { repairPath } from "@/lib/navigation/feature-paths"
import { APP_ROUTES } from "@/lib/navigation/paths"
import {
  isRepairStatus,
  type ApprovalMethod,
  type PaymentMethod,
  type RepairStatus,
} from "@/lib/repairs/constants"
import type { Json } from "@/types/database"
import { createClient } from "@/lib/supabase/server"

export type ActionResult = { error: string } | { success?: string; id?: string }

const intakeResult = z.enum(["working", "not_working", "not_tested", "not_applicable"])

const createRepairSchema = z.object({
  customerId: z.string().uuid(),
  deviceId: z.string().uuid(),
  reportedIssue: z.string().trim().min(3).max(2000),
  deviceCondition: z.string().trim().max(2000).optional().or(z.literal("")),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  assignedTechnicianId: z.string().uuid().optional().or(z.literal("")),
  estimatedCompletionDate: z.string().optional().or(z.literal("")),
  internalNotes: z.string().trim().max(2000).optional().or(z.literal("")),
  accessories: z
    .array(
      z.object({
        accessory_type: z.enum([
          "sim",
          "sim_tray",
          "charger",
          "cable",
          "case",
          "memory_card",
          "box",
          "other",
        ]),
        present: z.boolean(),
        notes: z.string().optional(),
      })
    )
    .default([]),
  intakeChecks: z
    .array(
      z.object({
        check_definition_id: z.string().uuid(),
        result: intakeResult,
        notes: z.string().optional(),
      })
    )
    .default([]),
})

export async function createRepairJobAction(input: unknown): Promise<ActionResult> {
  const session = await requireWorkspaceSession()
  if (!canPerform(session.role, "intakeRepairs")) {
    return { error: "You cannot create repair jobs." }
  }

  const parsed = createRepairSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check repair intake details." }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("create_repair_job", {
    p_payload: {
      shop_id: session.shop.id,
      customer_id: parsed.data.customerId,
      device_id: parsed.data.deviceId,
      reported_issue: parsed.data.reportedIssue,
      device_condition: parsed.data.deviceCondition || null,
      priority: parsed.data.priority,
      assigned_technician_id: parsed.data.assignedTechnicianId || null,
      estimated_completion_date: parsed.data.estimatedCompletionDate || null,
      internal_notes: parsed.data.internalNotes || null,
      accessories: parsed.data.accessories,
      intake_checks: parsed.data.intakeChecks,
    },
  })

  if (error || !data) {
    return { error: error?.message ?? "Could not create repair job." }
  }

  revalidatePath(APP_ROUTES.repairs)
  redirect(repairPath(data))
}

export async function changeRepairStatusAction(input: {
  repairId: string
  status: string
  note?: string
}): Promise<ActionResult> {
  const session = await requireWorkspaceSession()
  if (!canAccess(session.role, "repairs")) {
    return { error: "You cannot change repair status." }
  }
  if (!isRepairStatus(input.status)) {
    return { error: "Invalid status." }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc("change_repair_status", {
    p_repair_job_id: input.repairId,
    p_new_status: input.status as RepairStatus,
    p_note: input.note || undefined,
  })

  if (error) return { error: error.message }
  revalidatePath(repairPath(input.repairId))
  revalidatePath(APP_ROUTES.repairs)
  return { success: "Status updated." }
}

export async function updateRepairDetailsAction(
  repairId: string,
  payload: Json
): Promise<ActionResult> {
  const session = await requireWorkspaceSession()
  if (!canAccess(session.role, "repairs")) {
    return { error: "You cannot update this repair." }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc("update_repair_job_details", {
    p_repair_job_id: repairId,
    p_payload: payload,
  })

  if (error) return { error: error.message }
  revalidatePath(repairPath(repairId))
  return { success: "Repair details saved." }
}

export async function cancelRepairAction(input: {
  repairId: string
  reason: string
}): Promise<ActionResult> {
  const session = await requireWorkspaceSession()
  if (!canAccess(session.role, "repairs")) {
    return { error: "You cannot cancel repairs." }
  }
  if (!input.reason.trim()) {
    return { error: "Cancellation reason is required." }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc("cancel_repair", {
    p_repair_job_id: input.repairId,
    p_reason: input.reason.trim(),
  })

  if (error) return { error: error.message }
  revalidatePath(repairPath(input.repairId))
  revalidatePath(APP_ROUTES.repairs)
  return {
    success:
      "Repair cancelled. This does not automatically refund payments — process refunds separately if needed.",
  }
}

export async function createEstimateAction(input: {
  repairId: string
  notes?: string
  discountAmount?: number
  items: Array<{
    line_type: "labor" | "part"
    repair_service_id?: string
    product_id?: string
    quantity: number
    description?: string
  }>
}): Promise<ActionResult> {
  const session = await requireWorkspaceSession()
  if (!canAccess(session.role, "repairs")) {
    return { error: "You cannot create estimates." }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("create_repair_estimate", {
    p_payload: {
      repair_job_id: input.repairId,
      notes: input.notes || null,
      discount_amount: input.discountAmount ?? 0,
      items: input.items,
    },
  })

  if (error || !data) return { error: error?.message ?? "Could not create estimate." }
  revalidatePath(repairPath(input.repairId))
  return { success: "Draft estimate created.", id: data }
}

export async function updateDraftEstimateAction(input: {
  estimateId: string
  repairId: string
  notes?: string
  discountAmount?: number
  items?: Array<{
    line_type: "labor" | "part"
    repair_service_id?: string
    product_id?: string
    quantity: number
    description?: string
  }>
}): Promise<ActionResult> {
  const session = await requireWorkspaceSession()
  if (!canAccess(session.role, "repairs")) {
    return { error: "You cannot edit estimates." }
  }

  const payload: Json = {
    estimate_id: input.estimateId,
    notes: input.notes ?? null,
    discount_amount: input.discountAmount ?? null,
  }
  if (input.items) {
    ;(payload as Record<string, Json>)["items"] = input.items as unknown as Json
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc("update_draft_estimate", { p_payload: payload })
  if (error) return { error: error.message }
  revalidatePath(repairPath(input.repairId))
  return { success: "Draft estimate updated." }
}

export async function sendEstimateAction(estimateId: string, repairId: string): Promise<ActionResult> {
  await requireWorkspaceSession()
  const supabase = await createClient()
  const { error } = await supabase.rpc("send_repair_estimate", { p_estimate_id: estimateId })
  if (error) return { error: error.message }
  revalidatePath(repairPath(repairId))
  return { success: "Estimate marked as sent." }
}

export async function approveEstimateAction(
  estimateId: string,
  repairId: string,
  method: ApprovalMethod = "in_person"
): Promise<ActionResult> {
  await requireWorkspaceSession()
  const supabase = await createClient()
  const { error } = await supabase.rpc("approve_repair_estimate", {
    p_estimate_id: estimateId,
    p_method: method,
  })
  if (error) return { error: error.message }
  revalidatePath(repairPath(repairId))
  return { success: "Estimate approved." }
}

export async function rejectEstimateAction(
  estimateId: string,
  repairId: string,
  reason: string
): Promise<ActionResult> {
  await requireWorkspaceSession()
  const supabase = await createClient()
  const { error } = await supabase.rpc("reject_repair_estimate", {
    p_estimate_id: estimateId,
    p_reason: reason,
  })
  if (error) return { error: error.message }
  revalidatePath(repairPath(repairId))
  return { success: "Estimate rejected." }
}

export async function reviseEstimateAction(
  estimateId: string,
  repairId: string
): Promise<ActionResult> {
  await requireWorkspaceSession()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("revise_repair_estimate", {
    p_estimate_id: estimateId,
  })
  if (error || !data) return { error: error?.message ?? "Could not revise estimate." }
  revalidatePath(repairPath(repairId))
  return { success: "New draft version created.", id: data }
}

export async function consumeRepairPartsAction(input: {
  repairId: string
  items: Array<{ product_id: string; quantity: number }>
}): Promise<ActionResult> {
  const session = await requireWorkspaceSession()
  if (!canPerform(session.role, "consumeRepairParts")) {
    return { error: "You cannot consume repair parts." }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc("consume_repair_parts", {
    p_payload: {
      repair_job_id: input.repairId,
      items: input.items,
    },
  })
  if (error) return { error: error.message }
  revalidatePath(repairPath(input.repairId))
  return { success: "Parts consumed from inventory." }
}

export async function recordRepairPaymentAction(input: {
  repairId: string
  method: PaymentMethod
  amount?: number
  tenderedAmount?: number
  notes?: string
  idempotencyKey: string
}): Promise<ActionResult> {
  const session = await requireWorkspaceSession()
  if (!canPerform(session.role, "takePayments")) {
    return { error: "You cannot record payments." }
  }

  const payload: Json = {
    reference_type: "repair",
    reference_id: input.repairId,
    method: input.method,
    notes: input.notes || null,
    idempotency_key: input.idempotencyKey,
  }
  if (input.amount != null) {
    ;(payload as Record<string, Json>)["amount"] = input.amount
  }
  if (input.tenderedAmount != null) {
    ;(payload as Record<string, Json>)["tendered_amount"] = input.tenderedAmount
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("record_payment", { p_payload: payload })
  if (error || !data) return { error: error?.message ?? "Payment failed." }
  revalidatePath(repairPath(input.repairId))
  return { success: "Payment recorded.", id: data }
}

export async function uploadRepairPhotoAction(formData: FormData): Promise<ActionResult> {
  const session = await requireWorkspaceSession()
  if (!canAccess(session.role, "repairs")) {
    return { error: "You cannot upload repair photos." }
  }

  const repairId = String(formData.get("repairId") ?? "")
  const caption = String(formData.get("caption") ?? "").trim()
  const file = formData.get("file")
  if (!repairId || !(file instanceof File)) {
    return { error: "Repair and image file are required." }
  }

  const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]
  if (!allowed.includes(file.type)) {
    return { error: "Only JPEG, PNG, WebP, or HEIC images are allowed." }
  }
  if (file.size > 10 * 1024 * 1024) {
    return { error: "Image must be 10MB or smaller." }
  }

  const supabase = await createClient()
  const { data: job } = await supabase
    .from("repair_jobs")
    .select("id, organization_id, shop_id")
    .eq("id", repairId)
    .maybeSingle()

  if (!job) return { error: "Repair job not found." }

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg"
  const objectPath = `${job.organization_id}/${job.shop_id}/${job.id}/${crypto.randomUUID()}.${ext}`

  const bytes = new Uint8Array(await file.arrayBuffer())
  const { error: uploadError } = await supabase.storage
    .from("repair-photos")
    .upload(objectPath, bytes, {
      contentType: file.type,
      upsert: false,
    })

  if (uploadError) {
    return { error: uploadError.message }
  }

  const { error: metaError } = await supabase.from("repair_photos").insert({
    organization_id: job.organization_id,
    repair_job_id: job.id,
    storage_path: objectPath,
    caption: caption || null,
    uploaded_by: session.userId,
  })

  if (metaError) {
    await supabase.storage.from("repair-photos").remove([objectPath])
    return { error: metaError.message }
  }

  revalidatePath(repairPath(repairId))
  return { success: "Photo uploaded." }
}

export async function deleteRepairPhotoAction(photoId: string, repairId: string): Promise<ActionResult> {
  const session = await requireWorkspaceSession()
  if (!canAccess(session.role, "repairs")) {
    return { error: "You cannot delete repair photos." }
  }

  const supabase = await createClient()
  const { data: authz, error: authzError } = await supabase.rpc(
    "authorize_repair_photo_deletion",
    { p_photo_id: photoId }
  )

  if (authzError || !authz?.[0]?.storage_path) {
    return { error: authzError?.message ?? "Photo not found or not authorized." }
  }

  const trustedPath = authz[0].storage_path as string
  const { error: storageError } = await supabase.storage
    .from("repair-photos")
    .remove([trustedPath])

  if (storageError) {
    return {
      error: `Storage delete failed: ${storageError.message}. Metadata was not removed.`,
    }
  }

  const { error: metaError } = await supabase.rpc("delete_repair_photo", {
    p_photo_id: photoId,
  })

  if (metaError) {
    return {
      error: `Storage object removed, but metadata cleanup failed: ${metaError.message}. Retry deletion.`,
    }
  }

  revalidatePath(repairPath(repairId))
  return { success: "Photo removed." }
}

export async function createRepairServiceAction(input: {
  name: string
  defaultLaborCharge: number
  description?: string
  estimatedDurationMinutes?: number
  defaultWarrantyDays?: number
}): Promise<ActionResult> {
  const session = await requireWorkspaceSession()
  if (!canPerform(session.role, "manageSettings")) {
    return { error: "Only owners and admins can manage services." }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("repair_services")
    .insert({
      organization_id: session.organization.id,
      name: input.name,
      default_labor_charge: input.defaultLaborCharge,
      description: input.description || null,
      estimated_duration_minutes: input.estimatedDurationMinutes ?? null,
      default_warranty_days: input.defaultWarrantyDays ?? 0,
    })
    .select("id")
    .single()

  if (error || !data) return { error: error?.message ?? "Could not create service." }
  return { success: "Service created.", id: data.id }
}

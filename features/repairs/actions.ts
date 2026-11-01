"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"

import { canAccess, canPerform } from "@/lib/auth/permissions"
import { requireWorkspaceSession } from "@/lib/auth/workspace"
import { repairPath, repairPrintPath } from "@/lib/navigation/feature-paths"
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

const acceptRepairSchema = z.object({
  customerName: z.string().trim().min(1, "Customer name is required").max(120),
  phone: z.string().trim().min(5, "Phone number is required").max(40),
  device: z.string().trim().min(1, "Device is required").max(120),
  issue: z.string().trim().min(3, "Describe the problem").max(2000),
  price: z.coerce.number().min(0, "Price cannot be negative"),
})

export async function acceptRepairAction(input: unknown): Promise<ActionResult> {
  const session = await requireWorkspaceSession()
  if (!canPerform(session.role, "intakeRepairs")) {
    return { error: "You cannot accept repairs." }
  }

  const parsed = acceptRepairSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the repair details." }
  }

  const supabase = await createClient()
  const phone = parsed.data.phone
  const nameParts = parsed.data.customerName.split(/\s+/).filter(Boolean)
  const firstName = nameParts[0] ?? parsed.data.customerName
  const lastName = nameParts.slice(1).join(" ")

  const { data: existingCustomer, error: lookupError } = await supabase
    .from("customers")
    .select("id")
    .eq("is_walk_in", false)
    .eq("phone", phone)
    .limit(1)
    .maybeSingle()

  if (lookupError) return { error: lookupError.message }

  let customerId = existingCustomer?.id
  if (!customerId) {
    const { data: createdId, error: customerError } = await supabase.rpc(
      "create_customer",
      {
        p_payload: {
          shop_id: session.shop.id,
          first_name: firstName,
          last_name: lastName,
          phone,
        },
      }
    )
    if (customerError || !createdId) {
      return { error: customerError?.message ?? "Could not save the customer." }
    }
    customerId = createdId
  }

  const { data: device, error: deviceError } = await supabase
    .from("customer_devices")
    .insert({
      organization_id: session.organization.id,
      customer_id: customerId,
      device_type: "phone",
      model_label: parsed.data.device,
    })
    .select("id")
    .single()

  if (deviceError || !device) {
    return { error: deviceError?.message ?? "Could not save the device." }
  }

  const { data: jobId, error: jobError } = await supabase.rpc("create_repair_job", {
    p_payload: {
      shop_id: session.shop.id,
      customer_id: customerId,
      device_id: device.id,
      reported_issue: parsed.data.issue,
      priority: "normal",
      quoted_price: parsed.data.price,
    },
  })

  if (jobError || !jobId) {
    return { error: jobError?.message ?? "Could not accept the repair." }
  }

  revalidatePath(APP_ROUTES.repairs)
  revalidatePath(APP_ROUTES.customers)
  redirect(repairPrintPath(jobId))
}

const finishRepairSchema = z.object({
  repairId: z.string().uuid(),
  workDone: z.string().trim().max(2000).optional().or(z.literal("")),
  finalPrice: z.coerce.number().min(0, "Price cannot be negative"),
  collectPayment: z.boolean(),
  method: z.enum(["cash", "card", "bank_transfer", "other"]),
})

export async function finishRepairAction(input: unknown): Promise<ActionResult> {
  const session = await requireWorkspaceSession()
  if (!canAccess(session.role, "repairs")) {
    return { error: "You cannot finish repairs." }
  }

  const parsed = finishRepairSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the completion details." }
  }

  const supabase = await createClient()
  const repairId = parsed.data.repairId

  const { data: job, error: jobError } = await supabase
    .from("repair_jobs")
    .select("id, status, shop_id")
    .eq("id", repairId)
    .maybeSingle()

  if (jobError) return { error: jobError.message }
  if (!job || job.shop_id !== session.shop.id) return { error: "Repair not found." }
  if (job.status === "cancelled") return { error: "This repair was cancelled." }
  if (job.status === "delivered") return { error: "This repair is already delivered." }

  const { error: detailError } = await supabase.rpc("update_repair_job_details", {
    p_repair_job_id: repairId,
    p_payload: {
      work_done: parsed.data.workDone || "",
      final_price: parsed.data.finalPrice,
    },
  })

  if (detailError) {
    const message = detailError.message
    if (message.includes("final_price") || message.includes("work_done")) {
      return {
        error:
          "Apply the latest database migration, then finish the repair again. The shop database does not have the simple completion step yet.",
      }
    }
    return { error: message }
  }

  const { data: payments, error: paymentReadError } = await supabase
    .from("payments")
    .select("amount, entry_type, voided_at")
    .eq("reference_type", "repair")
    .eq("reference_id", repairId)

  if (paymentReadError) return { error: paymentReadError.message }

  const paid = (payments ?? []).reduce((sum, row) => {
    if (row.voided_at) return sum
    const amount = Number(row.amount)
    if (row.entry_type === "refund") return sum - amount
    return sum + amount
  }, 0)
  const due = Math.round((parsed.data.finalPrice - paid) * 100) / 100

  if (parsed.data.collectPayment && due > 0) {
    if (!canPerform(session.role, "takePayments")) {
      return { error: "You cannot take payment. Finish without collecting, or ask a cashier." }
    }
    const { error: payError } = await supabase.rpc("record_payment", {
      p_payload: {
        reference_type: "repair",
        reference_id: repairId,
        method: parsed.data.method,
        amount: due,
        idempotency_key: crypto.randomUUID(),
      },
    })
    if (payError) return { error: payError.message }
  }

  if (job.status !== "completed") {
    const { error: statusError } = await supabase.rpc("change_repair_status", {
      p_repair_job_id: repairId,
      p_new_status: "completed",
      p_note: parsed.data.workDone || "Completed",
    })
    if (statusError) {
      if (statusError.message.includes("Invalid repair status transition")) {
        return {
          error:
            "Apply the latest database migration so a received repair can be marked completed directly.",
        }
      }
      return { error: statusError.message }
    }
  }

  revalidatePath(repairPath(repairId))
  revalidatePath(repairPrintPath(repairId))
  revalidatePath(APP_ROUTES.repairs)
  revalidatePath(APP_ROUTES.dashboard)
  revalidatePath(APP_ROUTES.reports)

  if (parsed.data.finalPrice + 0.001 < paid) {
    return {
      success:
        "Repair completed. The customer already paid more than this price, so refund the difference separately.",
    }
  }

  return { success: "Repair completed." }
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

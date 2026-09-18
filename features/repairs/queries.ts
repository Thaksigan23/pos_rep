import "server-only"

import { canPerform } from "@/lib/auth/permissions"
import type { AppRole } from "@/lib/auth/roles"
import { PAGE_SIZE } from "@/lib/navigation/paths"
import { isRepairStatus, type RepairStatus } from "@/lib/repairs/constants"
import { signRepairPhotoPaths } from "@/lib/storage/signed-urls"
import { createClient } from "@/lib/supabase/server"

export async function searchRepairJobs(options: {
  q?: string
  status?: string
  page?: number
  shopId?: string
  technicianId?: string
}) {
  const page = Math.max(1, options.page ?? 1)
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1
  const supabase = await createClient()

  let query = supabase
    .from("repair_jobs")
    .select(
      `id, ticket_number, status, priority, total, created_at, reported_issue,
       estimated_completion_date, assigned_technician_id, shop_id,
       customers(id, first_name, last_name, phone, customer_number),
       customer_devices(id, model_label, imei, device_type,
         device_models(name, device_brands(name))),
       profiles!repair_jobs_assigned_technician_id_fkey(id, first_name, last_name)`,
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(from, to)

  if (options.shopId) {
    query = query.eq("shop_id", options.shopId)
  }

  if (options.status && options.status !== "all" && isRepairStatus(options.status)) {
    query = query.eq("status", options.status)
  }

  if (options.technicianId) {
    query = query.eq("assigned_technician_id", options.technicianId)
  }

  const q = options.q?.trim()
  if (q) {
    const pattern = `%${q}%`
    query = query.or(
      `ticket_number.ilike.${pattern},reported_issue.ilike.${pattern}`
    )
  }

  const { data, error, count } = await query
  if (error) throw new Error(error.message)

  return {
    rows: data ?? [],
    total: count ?? 0,
    page,
    pageSize: PAGE_SIZE,
  }
}

export async function getRepairJobDetail(repairId: string, role: AppRole) {
  const supabase = await createClient()
  const { data: job, error } = await supabase
    .from("repair_jobs")
    .select(
      `*,
       customers(id, first_name, last_name, phone, email, customer_number, alternate_phone),
       customer_devices(id, model_label, imei, serial_number, color, storage_capacity, device_type,
         device_models(id, name, device_brands(id, name))),
       profiles!repair_jobs_assigned_technician_id_fkey(id, first_name, last_name, role)`
    )
    .eq("id", repairId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!job) return null

  const [
    history,
    accessories,
    intakeChecks,
    estimates,
    parts,
    photos,
    payments,
    payable,
    paid,
  ] = await Promise.all([
    supabase
      .from("repair_status_history")
      .select("id, previous_status, new_status, note, created_at, changed_by")
      .eq("repair_job_id", repairId)
      .order("created_at", { ascending: true }),
    supabase
      .from("repair_accessories")
      .select("id, accessory_type, present, notes")
      .eq("repair_job_id", repairId),
    supabase
      .from("device_intake_checks")
      .select(
        "id, result, notes, check_definition_id, intake_check_definitions(id, label, sort_order)"
      )
      .eq("repair_job_id", repairId),
    supabase
      .from("repair_estimates")
      .select(
        `id, version, status, subtotal, tax_amount, discount_amount, total, notes,
         customer_approved_at, rejected_at, rejection_reason, created_at, estimate_number,
         repair_estimate_items(id, line_type, description_snapshot, quantity, unit_price, line_total,
           product_id, repair_service_id)`
      )
      .eq("repair_job_id", repairId)
      .order("version", { ascending: false }),
    supabase
      .from("repair_parts")
      .select(
        canPerform(role, "viewCostPrices")
          ? `id, quantity_consumed, quantity_reserved, unit_price, product_id,
             products(id, name, sku),
             repair_part_costs(unit_cost)`
          : `id, quantity_consumed, quantity_reserved, unit_price, product_id,
             products(id, name, sku)`
      )
      .eq("repair_job_id", repairId),
    supabase
      .from("repair_photos")
      .select("id, storage_path, caption, created_at, uploaded_by")
      .eq("repair_job_id", repairId)
      .order("created_at", { ascending: false }),
    supabase
      .from("payments")
      .select(
        "id, amount, method, notes, created_at, voided_at, void_reason, tendered_amount, change_amount, entry_type"
      )
      .eq("reference_type", "repair")
      .eq("reference_id", repairId)
      .order("created_at", { ascending: false }),
    supabase.rpc("document_payable_total", {
      p_organization_id: job.organization_id,
      p_reference_type: "repair",
      p_reference_id: repairId,
    }),
    supabase.rpc("paid_total", {
      p_reference_type: "repair",
      p_reference_id: repairId,
    }),
  ])

  const photoRows = photos.data ?? []
  const signed = await signRepairPhotoPaths(
    photoRows.map((photo) => photo.storage_path)
  )

  const payableTotal = Number(payable.data ?? job.total ?? 0)
  const paidTotal = Number(paid.data ?? 0)
  const outstanding = Math.max(0, payableTotal - paidTotal)

  return {
    job,
    history: history.data ?? [],
    accessories: accessories.data ?? [],
    intakeChecks: intakeChecks.data ?? [],
    estimates: estimates.data ?? [],
    parts: parts.data ?? [],
    photos: photoRows,
    photoUrls: Object.fromEntries(
      photoRows.map((photo) => [
        photo.id,
        signed.get(photo.storage_path) ?? null,
      ])
    ),
    payments: payments.data ?? [],
    payableTotal,
    paidTotal,
    outstanding,
  }
}

export async function listIntakeCheckDefinitions() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("intake_check_definitions")
    .select("id, label, sort_order, is_active")
    .eq("is_active", true)
    .order("sort_order")
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function listRepairServices() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("repair_services")
    .select("id, name, default_labor_charge, description, is_active")
    .eq("is_active", true)
    .order("name")
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function listAssignableTechnicians(shopId: string) {
  const supabase = await createClient()
  const { data: members } = await supabase
    .from("shop_members")
    .select("user_id")
    .eq("shop_id", shopId)

  const memberIds = (members ?? []).map((m) => m.user_id)
  const { data, error } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, role, default_shop_id")
    .eq("is_active", true)
    .in("role", ["technician", "admin", "owner"])
  if (error) throw new Error(error.message)

  return (data ?? []).filter((profile) => {
    if (profile.role === "owner" || profile.role === "admin") return true
    return memberIds.includes(profile.id) || profile.default_shop_id === shopId
  })
}

export async function listShopProductsForParts(shopId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("products")
    .select(
      `id, name, sku, selling_price, is_active,
       product_stocks!inner(shop_id, quantity)`
    )
    .eq("is_active", true)
    .eq("product_stocks.shop_id", shopId)
    .order("name")
    .limit(200)

  if (error) throw new Error(error.message)
  return data ?? []
}

export async function getCustomerDevices(customerId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("customer_devices")
    .select(
      "id, model_label, imei, serial_number, device_type, color, storage_capacity, device_models(name, device_brands(name))"
    )
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
  if (error) throw new Error(error.message)
  return data ?? []
}

export type { RepairStatus }

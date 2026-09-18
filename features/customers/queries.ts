import "server-only"

import { PAGE_SIZE } from "@/lib/navigation/paths"
import { createClient } from "@/lib/supabase/server"

export type CustomerListItem = {
  id: string
  customer_number: string
  first_name: string
  last_name: string
  phone: string | null
  email: string | null
  is_walk_in: boolean
  created_at: string
}

export async function searchCustomers(options: {
  q?: string
  page?: number
  includeWalkIn?: boolean
}) {
  const page = Math.max(1, options.page ?? 1)
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1
  const supabase = await createClient()

  let query = supabase
    .from("customers")
    .select(
      "id, customer_number, first_name, last_name, phone, email, is_walk_in, created_at",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(from, to)

  if (!options.includeWalkIn) {
    query = query.eq("is_walk_in", false)
  }

  const q = options.q?.trim()
  if (q) {
    const pattern = `%${q}%`
    query = query.or(
      `first_name.ilike.${pattern},last_name.ilike.${pattern},phone.ilike.${pattern},customer_number.ilike.${pattern},email.ilike.${pattern}`
    )
  }

  const { data, error, count } = await query
  if (error) {
    throw new Error(error.message)
  }

  return {
    rows: (data ?? []) as CustomerListItem[],
    total: count ?? 0,
    page,
    pageSize: PAGE_SIZE,
  }
}

export async function getCustomerDetail(customerId: string) {
  const supabase = await createClient()
  const { data: customer, error } = await supabase
    .from("customers")
    .select("*")
    .eq("id", customerId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!customer) return null

  const [devices, repairs] = await Promise.all([
    supabase
      .from("customer_devices")
      .select(
        "id, imei, serial_number, color, storage_capacity, device_type, model_label, notes, device_model_id, device_models(id, name, device_brands(id, name))"
      )
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false }),
    supabase
      .from("repair_jobs")
      .select(
        "id, ticket_number, status, priority, total, created_at, reported_issue, device_id"
      )
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })
      .limit(50),
  ])

  const repairRows = repairs.data ?? []
  const balances = await Promise.all(
    repairRows.map(async (job) => {
      const { data } = await supabase.rpc("paid_total", {
        p_reference_type: "repair",
        p_reference_id: job.id,
      })
      const paid = Number(data ?? 0)
      return {
        repairId: job.id,
        paid,
        outstanding: Math.max(0, Number(job.total) - paid),
      }
    })
  )

  return {
    customer,
    devices: devices.data ?? [],
    repairs: repairRows,
    balances,
    devicesError: devices.error?.message,
    repairsError: repairs.error?.message,
  }
}

export async function listDeviceCatalog() {
  const supabase = await createClient()
  const [{ data: brands }, { data: models }] = await Promise.all([
    supabase
      .from("device_brands")
      .select("id, name")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("device_models")
      .select("id, name, device_brand_id, device_type")
      .eq("is_active", true)
      .order("name"),
  ])
  return { brands: brands ?? [], models: models ?? [] }
}

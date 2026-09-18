import "server-only"

import { PAGE_SIZE } from "@/lib/navigation/paths"
import { createClient } from "@/lib/supabase/server"
import type { Database } from "@/types/database"

export type WarrantyListItem = {
  id: string
  start_date: string
  end_date: string
  status: Database["public"]["Enums"]["warranty_status"]
  terms: string | null
  created_at: string
  repair_job_id: string
  ticket_number: string | null
  customer_first_name: string | null
  customer_last_name: string | null
}

export type WarrantyClaimRow = {
  id: string
  claim_date: string
  description: string
  resolution: string | null
  status: string
  related_repair_job_id: string | null
  created_at: string
  created_by: string | null
}

export async function searchWarranties(options: {
  shopId: string
  q?: string
  status?: string
  page?: number
}) {
  const page = Math.max(1, options.page ?? 1)
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1
  const supabase = await createClient()

  let query = supabase
    .from("warranties")
    .select(
      `id, start_date, end_date, status, terms, created_at, repair_job_id,
       repair_jobs!inner(id, ticket_number, shop_id, customer_id,
         customers(first_name, last_name))`,
      { count: "exact" }
    )
    .eq("repair_jobs.shop_id", options.shopId)
    .order("created_at", { ascending: false })
    .range(from, to)

  if (options.status && options.status !== "all") {
    query = query.eq(
      "status",
      options.status as Database["public"]["Enums"]["warranty_status"]
    )
  }

  const q = options.q?.trim()
  if (q) {
    query = query.or(`ticket_number.ilike.%${q}%`, {
      referencedTable: "repair_jobs",
    })
  }

  const { data, error, count } = await query
  if (error) throw new Error(error.message)

  const rows: WarrantyListItem[] = (data ?? []).map((row) => {
    const job = row.repair_jobs as {
      ticket_number: string
      customers: { first_name: string; last_name: string } | null
    } | null
    return {
      id: row.id,
      start_date: row.start_date,
      end_date: row.end_date,
      status: row.status,
      terms: row.terms,
      created_at: row.created_at,
      repair_job_id: row.repair_job_id,
      ticket_number: job?.ticket_number ?? null,
      customer_first_name: job?.customers?.first_name ?? null,
      customer_last_name: job?.customers?.last_name ?? null,
    }
  })

  return { rows, total: count ?? 0, page, pageSize: PAGE_SIZE }
}

export async function getWarrantyDetail(warrantyId: string) {
  const supabase = await createClient()
  const { data: warranty, error } = await supabase
    .from("warranties")
    .select(
      `id, start_date, end_date, status, terms, created_at, repair_job_id, repair_job_service_id,
       repair_jobs(id, ticket_number, shop_id, status, total, reported_issue, customer_id,
         customers(id, first_name, last_name, phone, customer_number))`
    )
    .eq("id", warrantyId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!warranty) return null

  const { data: claims, error: claimsError } = await supabase
    .from("warranty_claims")
    .select(
      "id, claim_date, description, resolution, status, related_repair_job_id, created_at, created_by"
    )
    .eq("warranty_id", warrantyId)
    .order("created_at", { ascending: false })

  if (claimsError) throw new Error(claimsError.message)

  const job = warranty.repair_jobs as {
    id: string
    ticket_number: string
    shop_id: string
    status: string
    total: number
    reported_issue: string | null
    customer_id: string | null
    customers: {
      id: string
      first_name: string
      last_name: string
      phone: string | null
      customer_number: string
    } | null
  } | null

  return {
    warranty: {
      id: warranty.id,
      start_date: warranty.start_date,
      end_date: warranty.end_date,
      status: warranty.status,
      terms: warranty.terms,
      created_at: warranty.created_at,
      repair_job_id: warranty.repair_job_id,
      repair_job_service_id: warranty.repair_job_service_id,
    },
    repair: job,
    claims: (claims ?? []) as WarrantyClaimRow[],
  }
}

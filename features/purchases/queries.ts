import "server-only"

import { PAGE_SIZE } from "@/lib/navigation/paths"
import { createClient } from "@/lib/supabase/server"
import type { Database } from "@/types/database"

type PurchaseStatus = Database["public"]["Enums"]["purchase_status"]

export async function searchPurchases(options: {
  q?: string
  status?: string
  supplierId?: string
  page?: number
}) {
  const page = Math.max(1, options.page ?? 1)
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1
  const supabase = await createClient()

  let query = supabase
    .from("purchases")
    .select(
      `id, purchase_number, status, total, subtotal, order_date, received_at,
       supplier_id, shop_id, created_at,
       suppliers(id, name),
       shops(id, name)`,
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(from, to)

  if (options.status) {
    query = query.eq("status", options.status as PurchaseStatus)
  }
  if (options.supplierId) query = query.eq("supplier_id", options.supplierId)

  const q = options.q?.trim()
  if (q) {
    query = query.ilike("purchase_number", `%${q}%`)
  }

  const { data, error, count } = await query
  if (error) throw new Error(error.message)
  return { rows: data ?? [], total: count ?? 0, page, pageSize: PAGE_SIZE }
}

export async function getPurchaseDetail(purchaseId: string) {
  const supabase = await createClient()
  const { data: purchase, error } = await supabase
    .from("purchases")
    .select(
      `*,
       suppliers(id, name, phone, email),
       shops(id, name)`
    )
    .eq("id", purchaseId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!purchase) return null

  const [items, movements, payable, paid] = await Promise.all([
    supabase
      .from("purchase_items")
      .select(
        `id, product_id, quantity_ordered, quantity_received, unit_cost, line_total, tax_amount,
         products(id, name, sku, barcode)`
      )
      .eq("purchase_id", purchaseId)
      .order("created_at"),
    supabase
      .from("inventory_movements")
      .select(
        "id, created_at, quantity_change, movement_type, product_id, products(name, sku)"
      )
      .eq("reference_type", "purchase")
      .eq("reference_id", purchaseId)
      .order("created_at", { ascending: false }),
    supabase.rpc("document_payable_total", {
      p_organization_id: purchase.organization_id,
      p_reference_type: "purchase",
      p_reference_id: purchaseId,
    }),
    supabase.rpc("paid_total", {
      p_reference_type: "purchase",
      p_reference_id: purchaseId,
    }),
  ])

  const payableTotal = Number(payable.data ?? purchase.total)
  const paidTotal = Number(paid.data ?? 0)

  return {
    purchase,
    items: items.data ?? [],
    movements: movements.data ?? [],
    payableTotal,
    paidTotal,
    outstanding: Math.max(0, payableTotal - paidTotal),
  }
}

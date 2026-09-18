import "server-only"

import { PAGE_SIZE } from "@/lib/navigation/paths"
import { createClient } from "@/lib/supabase/server"

export async function searchSuppliers(options: {
  q?: string
  page?: number
  active?: "all" | "active" | "inactive"
}) {
  const page = Math.max(1, options.page ?? 1)
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1
  const supabase = await createClient()

  let query = supabase
    .from("suppliers")
    .select(
      "id, name, contact_person, phone, email, is_active, created_at",
      { count: "exact" }
    )
    .order("name")
    .range(from, to)

  if (options.active === "active") query = query.eq("is_active", true)
  if (options.active === "inactive") query = query.eq("is_active", false)

  const q = options.q?.trim()
  if (q) {
    const pattern = `%${q}%`
    query = query.or(
      `name.ilike.${pattern},contact_person.ilike.${pattern},phone.ilike.${pattern},email.ilike.${pattern}`
    )
  }

  const { data, error, count } = await query
  if (error) throw new Error(error.message)
  return { rows: data ?? [], total: count ?? 0, page, pageSize: PAGE_SIZE }
}

export async function getSupplierDetail(supplierId: string) {
  const supabase = await createClient()
  const { data: supplier, error } = await supabase
    .from("suppliers")
    .select("*")
    .eq("id", supplierId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!supplier) return null

  const [purchases, products] = await Promise.all([
    supabase
      .from("purchases")
      .select(
        "id, purchase_number, status, total, order_date, received_at, shop_id"
      )
      .eq("supplier_id", supplierId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("products")
      .select("id, name, sku, is_active")
      .eq("supplier_id", supplierId)
      .order("name")
      .limit(100),
  ])

  const purchaseRows = purchases.data ?? []
  const balances = await Promise.all(
    purchaseRows.map(async (p) => {
      const [{ data: payable }, { data: paid }] = await Promise.all([
        supabase.rpc("document_payable_total", {
          p_organization_id: supplier.organization_id,
          p_reference_type: "purchase",
          p_reference_id: p.id,
        }),
        supabase.rpc("paid_total", {
          p_reference_type: "purchase",
          p_reference_id: p.id,
        }),
      ])
      const payableTotal = Number(payable ?? p.total)
      const paidTotal = Number(paid ?? 0)
      return {
        purchaseId: p.id,
        outstanding: Math.max(0, payableTotal - paidTotal),
      }
    })
  )

  return {
    supplier,
    purchases: purchaseRows,
    products: products.data ?? [],
    balances,
  }
}

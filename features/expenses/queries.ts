import "server-only"

import { PAGE_SIZE } from "@/lib/navigation/paths"
import { createClient } from "@/lib/supabase/server"
import type { Database } from "@/types/database"

export type ExpenseListItem = {
  id: string
  amount: number
  expense_date: string
  description: string | null
  payment_method: Database["public"]["Enums"]["payment_method"]
  category_id: string
  category_name: string | null
  created_at: string
}

export type ExpenseCategory = {
  id: string
  name: string
  is_active: boolean
}

export async function searchExpenses(options: {
  shopId: string
  q?: string
  categoryId?: string
  fromDate?: string
  toDate?: string
  page?: number
}) {
  const page = Math.max(1, options.page ?? 1)
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1
  const supabase = await createClient()

  let query = supabase
    .from("expenses")
    .select(
      "id, amount, expense_date, description, payment_method, category_id, created_at, expense_categories(name)",
      { count: "exact" }
    )
    .eq("shop_id", options.shopId)
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, to)

  if (options.categoryId) {
    query = query.eq("category_id", options.categoryId)
  }
  if (options.fromDate) {
    query = query.gte("expense_date", options.fromDate)
  }
  if (options.toDate) {
    query = query.lte("expense_date", options.toDate)
  }

  const q = options.q?.trim()
  if (q) {
    query = query.ilike("description", `%${q}%`)
  }

  const { data, error, count } = await query
  if (error) throw new Error(error.message)

  const rows: ExpenseListItem[] = (data ?? []).map((row) => {
    const cat = row.expense_categories as { name: string } | null
    return {
      id: row.id,
      amount: Number(row.amount),
      expense_date: row.expense_date,
      description: row.description,
      payment_method: row.payment_method,
      category_id: row.category_id,
      category_name: cat?.name ?? null,
      created_at: row.created_at,
    }
  })

  return {
    rows,
    total: count ?? 0,
    page,
    pageSize: PAGE_SIZE,
  }
}

export async function listExpenseCategories(options?: { activeOnly?: boolean }) {
  const supabase = await createClient()
  let query = supabase
    .from("expense_categories")
    .select("id, name, is_active")
    .order("name")

  if (options?.activeOnly !== false) {
    query = query.eq("is_active", true)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as ExpenseCategory[]
}

export async function getExpense(expenseId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("expenses")
    .select(
      "id, shop_id, category_id, amount, expense_date, description, payment_method, created_at, updated_at, expense_categories(id, name)"
    )
    .eq("id", expenseId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return null

  const cat = data.expense_categories as { id: string; name: string } | null
  return {
    id: data.id,
    shop_id: data.shop_id,
    category_id: data.category_id,
    amount: Number(data.amount),
    expense_date: data.expense_date,
    description: data.description,
    payment_method: data.payment_method,
    created_at: data.created_at,
    updated_at: data.updated_at,
    category_name: cat?.name ?? null,
  }
}

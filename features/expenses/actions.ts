"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"

import { canPerform } from "@/lib/auth/permissions"
import { requireWorkspaceSession } from "@/lib/auth/workspace"
import { isPaymentMethod } from "@/lib/expenses/constants"
import { expensePath } from "@/lib/navigation/feature-paths"
import { APP_ROUTES } from "@/lib/navigation/paths"
import { createClient } from "@/lib/supabase/server"

export type ActionResult = { error: string } | { success: string; id?: string }

const expenseSchema = z.object({
  categoryId: z.string().uuid("Select a category"),
  amount: z.coerce.number().positive("Amount must be greater than zero"),
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  paymentMethod: z.string().refine(isPaymentMethod, "Invalid payment method"),
})

const categorySchema = z.object({
  name: z.string().trim().min(1).max(80),
})

export async function createExpenseAction(input: unknown): Promise<ActionResult> {
  const session = await requireWorkspaceSession()
  if (!canPerform(session.role, "manageExpenses")) {
    return { error: "You cannot manage expenses." }
  }

  const parsed = expenseSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check expense details." }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("expenses")
    .insert({
      organization_id: session.organization.id,
      shop_id: session.shop.id,
      category_id: parsed.data.categoryId,
      amount: parsed.data.amount,
      expense_date: parsed.data.expenseDate,
      description: parsed.data.description || null,
      payment_method: parsed.data.paymentMethod,
      created_by: session.profile.id,
    })
    .select("id")
    .single()

  if (error || !data) {
    return { error: error?.message ?? "Could not create expense." }
  }

  revalidatePath(APP_ROUTES.expenses)
  revalidatePath(APP_ROUTES.dashboard)
  redirect(expensePath(data.id))
}

export async function updateExpenseAction(
  expenseId: string,
  input: unknown
): Promise<ActionResult> {
  const session = await requireWorkspaceSession()
  if (!canPerform(session.role, "manageExpenses")) {
    return { error: "You cannot manage expenses." }
  }

  const parsed = expenseSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check expense details." }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from("expenses")
    .update({
      category_id: parsed.data.categoryId,
      amount: parsed.data.amount,
      expense_date: parsed.data.expenseDate,
      description: parsed.data.description || null,
      payment_method: parsed.data.paymentMethod,
    })
    .eq("id", expenseId)

  if (error) return { error: error.message }

  revalidatePath(expensePath(expenseId))
  revalidatePath(APP_ROUTES.expenses)
  revalidatePath(APP_ROUTES.dashboard)
  return { success: "Expense updated." }
}

export async function createExpenseCategoryAction(
  input: unknown
): Promise<ActionResult> {
  const session = await requireWorkspaceSession()
  if (!canPerform(session.role, "manageExpenses")) {
    return { error: "You cannot manage expense categories." }
  }

  const parsed = categorySchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check category name." }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("expense_categories")
    .insert({
      organization_id: session.organization.id,
      name: parsed.data.name,
      is_active: true,
    })
    .select("id")
    .single()

  if (error || !data) {
    if (error?.message.toLowerCase().includes("unique")) {
      return { error: "A category with that name already exists." }
    }
    return { error: error?.message ?? "Could not create category." }
  }

  revalidatePath(APP_ROUTES.expenses)
  return { success: "Category created.", id: data.id }
}

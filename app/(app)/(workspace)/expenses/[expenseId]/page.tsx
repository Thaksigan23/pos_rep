import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Receipt } from "lucide-react"

import { PageHeader } from "@/components/app/page-header"
import { buttonVariants } from "@/components/ui/button"
import { ExpenseForm } from "@/features/expenses/components/expense-form"
import {
  getExpense,
  listExpenseCategories,
} from "@/features/expenses/queries"
import { requirePageAccess } from "@/lib/auth/workspace"
import { formatDisplayDate } from "@/lib/datetime/format"
import { APP_ROUTES } from "@/lib/navigation/paths"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Edit expense" }

export default async function ExpenseDetailPage({
  params,
}: {
  params: Promise<{ expenseId: string }>
}) {
  const session = await requirePageAccess("expenses")
  const { expenseId } = await params
  const [expense, categories] = await Promise.all([
    getExpense(expenseId),
    listExpenseCategories({ activeOnly: false }),
  ])

  if (!expense || expense.shop_id !== session.shop.id) {
    notFound()
  }

  return (
    <div className="page-stack mx-auto max-w-xl">
      <Link
        href={APP_ROUTES.expenses}
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "-ml-2 w-fit"
        )}
      >
        <ArrowLeft className="size-4" />
        Expenses
      </Link>
      <PageHeader
        eyebrow={session.shop.name}
        title="Edit expense"
        description={formatDisplayDate(
          expense.expense_date,
          session.shopSettings.timezone
        )}
        icon={Receipt}
      />
      <div className="panel panel-pad">
        <ExpenseForm
          mode="edit"
          expenseId={expense.id}
          categories={categories}
          defaults={{
            categoryId: expense.category_id,
            amount: expense.amount,
            expenseDate: expense.expense_date,
            description: expense.description ?? "",
            paymentMethod: expense.payment_method,
          }}
        />
      </div>
    </div>
  )
}

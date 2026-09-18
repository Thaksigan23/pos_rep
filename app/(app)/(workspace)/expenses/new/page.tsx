import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Receipt } from "lucide-react"

import { PageHeader } from "@/components/app/page-header"
import { buttonVariants } from "@/components/ui/button"
import { ExpenseForm } from "@/features/expenses/components/expense-form"
import { listExpenseCategories } from "@/features/expenses/queries"
import { requirePageAccess } from "@/lib/auth/workspace"
import { APP_ROUTES } from "@/lib/navigation/paths"
import { localDateString } from "@/lib/reporting/timezone"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "New expense" }

export default async function NewExpensePage() {
  const session = await requirePageAccess("expenses")
  const categories = await listExpenseCategories()
  const today = localDateString(session.shopSettings.timezone)

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
        title="New expense"
        description="Log an operating cost for this shop."
        icon={Receipt}
      />
      <div className="panel panel-pad">
        <ExpenseForm
          mode="create"
          categories={categories}
          defaults={{ expenseDate: today, paymentMethod: "cash" }}
        />
      </div>
    </div>
  )
}

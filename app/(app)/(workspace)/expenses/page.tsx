import type { Metadata } from "next"
import Link from "next/link"
import { Plus, Receipt, Search } from "lucide-react"

import { EmptyState } from "@/components/app/empty-state"
import { PageHeader } from "@/components/app/page-header"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  listExpenseCategories,
  searchExpenses,
} from "@/features/expenses/queries"
import { requirePageAccess } from "@/lib/auth/workspace"
import { formatDisplayDate } from "@/lib/datetime/format"
import { EXPENSE_PAYMENT_METHOD_LABELS } from "@/lib/expenses/constants"
import { formatCurrency } from "@/lib/money/currency"
import { expenseNewPath, expensePath } from "@/lib/navigation/feature-paths"
import { APP_ROUTES, firstSearchParam } from "@/lib/navigation/paths"
import { localDateString } from "@/lib/reporting/timezone"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Expenses" }

const selectClass =
  "control-h h-10 rounded-lg border border-input bg-background px-3 text-sm"

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requirePageAccess("expenses")
  const params = await searchParams
  const q = firstSearchParam(params.q) ?? ""
  const categoryId = firstSearchParam(params.categoryId) ?? ""
  const fromDate = firstSearchParam(params.from) ?? ""
  const toDate = firstSearchParam(params.to) ?? ""
  const page = Math.max(1, Number(firstSearchParam(params.page) ?? "1") || 1)
  const { currencyCode, currencyLocale, timezone } = session.shopSettings

  const [{ rows, total, pageSize }, categories] = await Promise.all([
    searchExpenses({
      shopId: session.shop.id,
      q,
      categoryId: categoryId || undefined,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      page,
    }),
    listExpenseCategories({ activeOnly: false }),
  ])
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const today = localDateString(timezone)

  function href(overrides: Record<string, string | undefined>) {
    const sp = new URLSearchParams()
    const merged = {
      q,
      categoryId,
      from: fromDate,
      to: toDate,
      page: String(page),
      ...overrides,
    }
    for (const [k, v] of Object.entries(merged)) {
      if (!v) continue
      if (k === "page" && v === "1") continue
      sp.set(k, v)
    }
    const qs = sp.toString()
    return qs ? `${APP_ROUTES.expenses}?${qs}` : APP_ROUTES.expenses
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow={session.shop.name}
        title="Expenses"
        description="Record shop operating costs. Owner and admin only."
        icon={Receipt}
        actions={
          <Link
            href={expenseNewPath()}
            className={cn(buttonVariants(), "btn-h h-10 px-4")}
          >
            <Plus className="size-4" />
            New expense
          </Link>
        }
      />

      <form
        method="get"
        className="panel panel-pad flex flex-wrap items-end gap-2"
      >
        <div className="relative min-w-48 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            name="q"
            defaultValue={q}
            placeholder="Search description…"
            className="control-h h-10 pl-9"
            aria-label="Search expenses"
          />
        </div>
        <select
          name="categoryId"
          defaultValue={categoryId}
          className={selectClass}
          aria-label="Category"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <Input
          type="date"
          name="from"
          defaultValue={fromDate}
          className="control-h h-10 w-auto"
          aria-label="From date"
        />
        <Input
          type="date"
          name="to"
          defaultValue={toDate}
          className="control-h h-10 w-auto"
          aria-label="To date"
        />
        <Button type="submit" variant="outline" className="btn-h h-10 px-4">
          Filter
        </Button>
        {!fromDate && !toDate ? (
          <Link
            href={`${APP_ROUTES.expenses}?from=${today}&to=${today}`}
            className={cn(
              buttonVariants({ variant: "ghost" }),
              "btn-h h-10 px-3"
            )}
          >
            Today
          </Link>
        ) : null}
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No expenses found"
          description={
            q || categoryId || fromDate || toDate
              ? "Try adjusting filters, or record a new expense."
              : "Record your first expense for this shop."
          }
          action={{ label: "New expense", href: expenseNewPath() }}
        />
      ) : (
        <div className="panel overflow-x-auto">
          <Table className="table-dense">
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="hidden sm:table-cell">Method</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Link
                      href={expensePath(row.id)}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {formatDisplayDate(row.expense_date, timezone)}
                    </Link>
                  </TableCell>
                  <TableCell>{row.category_name ?? "—"}</TableCell>
                  <TableCell className="max-w-64 truncate text-muted-foreground">
                    {row.description ?? "—"}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">
                    {EXPENSE_PAYMENT_METHOD_LABELS[row.payment_method]}
                  </TableCell>
                  <TableCell className="money-cell font-medium">
                    {formatCurrency(row.amount, currencyCode, currencyLocale)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={expensePath(row.id)}
                      className={cn(
                        buttonVariants({ variant: "ghost", size: "sm" }),
                        "h-8 px-2"
                      )}
                    >
                      Open
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {page} of {totalPages} · {total} expenses
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link
                href={href({ page: String(page - 1) })}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                Previous
              </Link>
            ) : null}
            {page < totalPages ? (
              <Link
                href={href({ page: String(page + 1) })}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                Next
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

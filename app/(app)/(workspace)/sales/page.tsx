import type { Metadata } from "next"
import Link from "next/link"
import { FileText, Search, ShoppingBag } from "lucide-react"

import { EmptyState } from "@/components/app/empty-state"
import { PageHeader } from "@/components/app/page-header"
import { StatusBadge, type StatusTone } from "@/components/app/status-badge"
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
import { searchSales } from "@/features/sales/queries"
import { displayName } from "@/lib/auth/labels"
import { requirePageAccess } from "@/lib/auth/workspace"
import { formatDisplayDateTime } from "@/lib/datetime/format"
import { formatCurrency } from "@/lib/money/currency"
import { salePath } from "@/lib/navigation/feature-paths"
import { APP_ROUTES, firstSearchParam } from "@/lib/navigation/paths"
import {
  SALE_STATUS_LABELS,
  SALE_STATUS_TABS,
  type SaleStatus,
} from "@/lib/sales/constants"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Sales" }

const selectClass =
  "control-h h-10 rounded-lg border border-input bg-background px-3 text-sm"

function statusTone(status: SaleStatus): StatusTone {
  if (status === "cancelled") return "stop"
  if (status === "refunded") return "wait"
  if (status === "partially_refunded") return "wait"
  if (status === "held") return "info"
  if (status === "completed") return "ready"
  return "neutral"
}

function paymentLabel(status: SaleStatus): string {
  if (status === "completed") return "Paid"
  if (status === "partially_refunded") return "Partial refund"
  if (status === "refunded") return "Refunded"
  if (status === "held") return "Unpaid"
  return "—"
}

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requirePageAccess("sales")
  const params = await searchParams
  const q = firstSearchParam(params.q) ?? ""
  const status = firstSearchParam(params.status) ?? "all"
  const fromDate = firstSearchParam(params.from) ?? ""
  const toDate = firstSearchParam(params.to) ?? ""
  const page = Math.max(1, Number(firstSearchParam(params.page) ?? "1") || 1)
  const { currencyCode, currencyLocale, timezone } = session.shopSettings

  const { rows, total, pageSize } = await searchSales({
    q,
    status,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
    page,
    shopId: session.shop.id,
  })
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  function href(overrides: Record<string, string | undefined>) {
    const sp = new URLSearchParams()
    const merged = {
      q,
      status,
      from: fromDate,
      to: toDate,
      page: String(page),
      ...overrides,
    }
    for (const [k, v] of Object.entries(merged)) {
      if (!v) continue
      if (k === "status" && v === "all") continue
      if (k === "page" && v === "1") continue
      sp.set(k, v)
    }
    const qs = sp.toString()
    return qs ? `${APP_ROUTES.sales}?${qs}` : APP_ROUTES.sales
  }

  function tabHref(value: string) {
    return href({ status: value, page: "1" })
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow={session.shop.name}
        title="Sales"
        description="Completed, held, and refunded retail sales."
        icon={FileText}
        actions={
          <Link
            href={APP_ROUTES.pos}
            className={cn(buttonVariants(), "btn-h h-10 px-4")}
          >
            <ShoppingBag className="size-4" />
            Open POS
          </Link>
        }
      />

      <div
        className="-mx-1 overflow-x-auto px-1"
        role="navigation"
        aria-label="Sale status filters"
      >
        <div className="flex w-max gap-1.5 pb-1">
          {SALE_STATUS_TABS.map((tab) => (
            <Link
              key={tab.value}
              href={tabHref(tab.value)}
              className={cn(
                buttonVariants({
                  variant: status === tab.value ? "default" : "outline",
                  size: "sm",
                }),
                "shrink-0"
              )}
            >
              {tab.label}
            </Link>
          ))}
        </div>
      </div>

      <form
        method="get"
        className="panel panel-pad flex flex-wrap items-end gap-2"
      >
        {status !== "all" ? (
          <input type="hidden" name="status" value={status} />
        ) : null}
        <div className="relative min-w-56 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            name="q"
            defaultValue={q}
            placeholder="Search sale number…"
            className="control-h h-10 pl-9"
            aria-label="Search sales"
          />
        </div>
        <input
          type="date"
          name="from"
          defaultValue={fromDate}
          className={selectClass}
          aria-label="From date"
        />
        <input
          type="date"
          name="to"
          defaultValue={toDate}
          className={selectClass}
          aria-label="To date"
        />
        <Button type="submit" variant="outline" className="btn-h h-10 px-4">
          Filter
        </Button>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={
            q || fromDate || toDate || status !== "all"
              ? "No sales match these filters"
              : "No sales yet"
          }
          description="Complete a sale from POS or widen your filters."
          action={{ label: "Open POS", href: APP_ROUTES.pos }}
        />
      ) : (
        <div className="panel overflow-x-auto">
          <Table className="table-dense">
            <TableHeader>
              <TableRow>
                <TableHead>Sale #</TableHead>
                <TableHead className="hidden sm:table-cell">Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="hidden md:table-cell">Payment</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const customer = Array.isArray(row.customers)
                  ? row.customers[0]
                  : row.customers
                const label = row.sale_number ?? row.id.slice(0, 8)
                const rowStatus = row.status as SaleStatus
                const when = row.completed_at ?? row.held_at ?? row.created_at
                return (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Link
                        href={salePath(row.id)}
                        className="font-mono text-xs underline-offset-4 hover:underline"
                      >
                        {label}
                      </Link>
                      <p className="muted-xs sm:hidden">
                        {formatDisplayDateTime(when, timezone)}
                      </p>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">
                      {formatDisplayDateTime(when, timezone)}
                    </TableCell>
                    <TableCell>
                      {customer
                        ? customer.is_walk_in
                          ? "Walk-in"
                          : displayName(
                              customer.first_name,
                              customer.last_name,
                              "Customer"
                            )
                        : "—"}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {paymentLabel(rowStatus)}
                    </TableCell>
                    <TableCell className="money-cell">
                      {rowStatus === "held"
                        ? "—"
                        : formatCurrency(
                            row.total,
                            currencyCode,
                            currencyLocale
                          )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={statusTone(rowStatus)}>
                        {SALE_STATUS_LABELS[rowStatus]}
                      </StatusBadge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={salePath(row.id)}
                        className={cn(
                          buttonVariants({ variant: "ghost", size: "sm" }),
                          "h-8 px-2"
                        )}
                      >
                        Open
                      </Link>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {page} of {totalPages} · {total} sales
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

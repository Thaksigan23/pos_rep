import type { Metadata } from "next"
import Link from "next/link"
import { ClipboardList, Plus, Search } from "lucide-react"

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
import { searchPurchases } from "@/features/purchases/queries"
import { requirePageAccess } from "@/lib/auth/workspace"
import { formatDisplayDate } from "@/lib/datetime/format"
import {
  PURCHASE_STATUS_LABELS,
  type PurchaseStatus,
} from "@/lib/inventory/constants"
import { formatCurrency } from "@/lib/money/currency"
import { purchaseNewPath, purchasePath } from "@/lib/navigation/feature-paths"
import { APP_ROUTES, firstSearchParam } from "@/lib/navigation/paths"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Purchases" }

const selectClass =
  "control-h h-10 rounded-lg border border-input bg-background px-3 text-sm"

function tone(status: PurchaseStatus): StatusTone {
  if (status === "received") return "ready"
  if (status === "partially_received") return "wait"
  if (status === "cancelled") return "stop"
  return "info"
}

export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requirePageAccess("purchases")
  const params = await searchParams
  const q = firstSearchParam(params.q) ?? ""
  const status = firstSearchParam(params.status)
  const page = Math.max(1, Number(firstSearchParam(params.page) ?? "1") || 1)
  const { rows, total, pageSize } = await searchPurchases({ q, status, page })
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const { currencyCode, currencyLocale, timezone } = session.shopSettings

  function href(overrides: Record<string, string | undefined>) {
    const sp = new URLSearchParams()
    const merged = {
      q,
      status: status ?? "",
      page: String(page),
      ...overrides,
    }
    for (const [k, v] of Object.entries(merged)) {
      if (!v) continue
      if (k === "page" && v === "1") continue
      sp.set(k, v)
    }
    const qs = sp.toString()
    return qs ? `${APP_ROUTES.purchases}?${qs}` : APP_ROUTES.purchases
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Purchasing"
        title="Purchases"
        description="Create purchase orders and receive stock through the inventory ledger."
        icon={ClipboardList}
        actions={
          <Link
            href={purchaseNewPath()}
            className={cn(buttonVariants(), "btn-h h-10 px-4")}
          >
            <Plus className="size-4" />
            New purchase
          </Link>
        }
      />

      <form
        method="get"
        className="panel panel-pad flex flex-wrap items-end gap-2"
      >
        <div className="relative min-w-56 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            name="q"
            defaultValue={q}
            placeholder="Search purchase number…"
            className="control-h h-10 pl-9"
            aria-label="Search purchases"
          />
        </div>
        <select
          name="status"
          defaultValue={status ?? ""}
          className={selectClass}
          aria-label="Purchase status"
        >
          <option value="">All statuses</option>
          {(Object.keys(PURCHASE_STATUS_LABELS) as PurchaseStatus[]).map((s) => (
            <option key={s} value={s}>
              {PURCHASE_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline" className="btn-h h-10 px-4">
          Filter
        </Button>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No purchases"
          description="Create a purchase order against a supplier."
          action={{ label: "New purchase", href: purchaseNewPath() }}
        />
      ) : (
        <div className="panel overflow-x-auto">
          <Table className="table-dense">
            <TableHeader>
              <TableRow>
                <TableHead>Purchase #</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const supplier = Array.isArray(row.suppliers)
                  ? row.suppliers[0]
                  : row.suppliers
                return (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Link
                        href={purchasePath(row.id)}
                        className="font-mono text-xs font-medium underline-offset-4 hover:underline"
                      >
                        {row.purchase_number}
                      </Link>
                    </TableCell>
                    <TableCell>{supplier?.name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDisplayDate(row.order_date, timezone)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={tone(row.status as PurchaseStatus)}>
                        {PURCHASE_STATUS_LABELS[row.status as PurchaseStatus]}
                      </StatusBadge>
                    </TableCell>
                    <TableCell className="money-cell">
                      {formatCurrency(row.total, currencyCode, currencyLocale)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={purchasePath(row.id)}
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
            Page {page} of {totalPages} · {total} purchases
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

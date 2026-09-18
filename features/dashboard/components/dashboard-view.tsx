import Link from "next/link"
import {
  AlertTriangle,
  Package,
  ShoppingBag,
  Wrench,
} from "lucide-react"

import { EmptyState } from "@/components/app/empty-state"
import { StatusBadge, type StatusTone } from "@/components/app/status-badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { DashboardSummary } from "@/features/dashboard/queries"
import type { AppRole } from "@/lib/auth/roles"
import { canAccess } from "@/lib/auth/permissions"
import { formatDisplayDate, formatDisplayDateTime } from "@/lib/datetime/format"
import { formatCurrency } from "@/lib/money/currency"
import {
  productPath,
  repairNewPath,
  repairPath,
  salePath,
} from "@/lib/navigation/feature-paths"
import { APP_ROUTES } from "@/lib/navigation/paths"
import { REPAIR_STATUS_LABELS, type RepairStatus } from "@/lib/repairs/constants"
import { cn } from "@/lib/utils"

function MetricCard({
  label,
  value,
  hint,
  emphasis = "primary",
}: {
  label: string
  value: string
  hint?: string
  emphasis?: "primary" | "secondary"
}) {
  return (
    <Card
      className={cn(
        "shadow-none",
        emphasis === "secondary" && "bg-muted/30"
      )}
    >
      <CardHeader className="pb-2">
        <CardTitle
          className={cn(
            "text-xs font-medium uppercase tracking-wide text-muted-foreground",
            emphasis === "secondary" && "tracking-[0.12em]"
          )}
        >
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p
          className={cn(
            "font-semibold tabular-nums tracking-tight",
            emphasis === "primary" ? "text-2xl" : "text-xl"
          )}
        >
          {value}
        </p>
        {hint ? (
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  )
}

function repairTone(status: string): StatusTone {
  if (status === "ready_for_pickup" || status === "completed") return "ready"
  if (status === "cancelled") return "stop"
  if (status === "waiting_for_parts" || status === "waiting_for_customer_approval") {
    return "wait"
  }
  return "info"
}

function customerName(first: string | null, last: string | null) {
  const name = [first, last].filter(Boolean).join(" ").trim()
  return name || "—"
}

export function DashboardView({
  summary,
  role,
  currencyCode,
  currencyLocale,
  timezone,
}: {
  summary: DashboardSummary
  role: AppRole
  currencyCode: string
  currencyLocale: string
  timezone?: string | null
}) {
  const money = (n: number) => formatCurrency(n, currencyCode, currencyLocale)
  const isTech = role === "technician"
  const isOwnerAdmin = role === "owner" || role === "admin"
  const showFinancial = role === "owner" || role === "admin" || role === "cashier"
  const today = summary.today

  const repairEntries = Object.entries(summary.repairs).sort((a, b) =>
    a[0].localeCompare(b[0])
  )

  return (
    <div className="page-stack-tight">
      {isOwnerAdmin ? (
        <div className="flex flex-wrap gap-2">
          {canAccess(role, "pos") ? (
            <Link
              href={APP_ROUTES.pos}
              className={cn(buttonVariants({ size: "sm" }), "btn-h h-9")}
            >
              <ShoppingBag className="size-4" />
              Open POS
            </Link>
          ) : null}
          {canAccess(role, "repairs") ? (
            <Link
              href={repairNewPath()}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "btn-h h-9"
              )}
            >
              <Wrench className="size-4" />
              New repair
            </Link>
          ) : null}
          {canAccess(role, "sales") ? (
            <Link
              href={APP_ROUTES.sales}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "btn-h h-9"
              )}
            >
              Sales
            </Link>
          ) : null}
          {canAccess(role, "inventory") ? (
            <Link
              href={APP_ROUTES.inventory}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "btn-h h-9"
              )}
            >
              <Package className="size-4" />
              Inventory
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {canAccess(role, "pos") ? (
            <Link
              href={APP_ROUTES.pos}
              className={cn(buttonVariants({ size: "sm" }), "btn-h h-9")}
            >
              <ShoppingBag className="size-4" />
              Open POS
            </Link>
          ) : null}
          {canAccess(role, "repairs") ? (
            <Link
              href={APP_ROUTES.repairs}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "btn-h h-9"
              )}
            >
              <Wrench className="size-4" />
              Repairs
            </Link>
          ) : null}
          {canAccess(role, "sales") ? (
            <Link
              href={APP_ROUTES.sales}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "btn-h h-9"
              )}
            >
              Sales
            </Link>
          ) : null}
          {canAccess(role, "inventory") ? (
            <Link
              href={APP_ROUTES.inventory}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "btn-h h-9"
              )}
            >
              <Package className="size-4" />
              Inventory
            </Link>
          ) : null}
          {canAccess(role, "expenses") ? (
            <Link
              href={APP_ROUTES.expenses}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "btn-h h-9"
              )}
            >
              Expenses
            </Link>
          ) : null}
        </div>
      )}

      {showFinancial && today ? (
        <div>
          <p className="section-label mb-2">
            Today · {formatDisplayDate(summary.local_date)}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Sales today"
              value={money(today.sales_revenue)}
              hint={`${today.sales_count} completed sale${today.sales_count === 1 ? "" : "s"}`}
            />
            <MetricCard
              label="Collected"
              value={money(today.total_collected)}
              hint={`Sales + repairs − refunds · repairs ${money(today.repair_collected)} · −${money(today.refunds)}`}
            />
            {isOwnerAdmin && today.expenses !== undefined ? (
              <MetricCard
                label="Expenses"
                value={money(today.expenses)}
                hint="Recorded for today"
              />
            ) : (
              <MetricCard
                label="Repair collected"
                value={money(today.repair_collected)}
              />
            )}
            {isOwnerAdmin && today.net_cashflow !== undefined ? (
              <MetricCard
                label="Net cash flow"
                value={money(today.net_cashflow)}
                hint="Collected − expenses today"
              />
            ) : (
              <MetricCard
                label="Ready for pickup"
                value={String(summary.ready_for_pickup.length)}
                emphasis="secondary"
              />
            )}
          </div>
        </div>
      ) : null}

      {isOwnerAdmin && summary.inventory ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <MetricCard
            label="Low stock"
            value={String(summary.inventory.low_stock)}
            emphasis="secondary"
          />
          <MetricCard
            label="Out of stock"
            value={String(summary.inventory.out_of_stock)}
            emphasis="secondary"
          />
          <MetricCard
            label="Overdue repairs"
            value={String(summary.overdue_repairs)}
            emphasis="secondary"
          />
        </div>
      ) : null}

      {!isOwnerAdmin && !isTech ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <MetricCard
            label="Ready for pickup"
            value={String(summary.ready_for_pickup.length)}
            emphasis="secondary"
          />
          <MetricCard
            label="Overdue repairs"
            value={String(summary.overdue_repairs)}
            emphasis="secondary"
          />
        </div>
      ) : null}

      {isTech ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <MetricCard
            label="Assigned open jobs"
            value={String(summary.assigned_jobs?.length ?? 0)}
          />
          <MetricCard
            label="Ready for pickup"
            value={String(summary.ready_for_pickup.length)}
            emphasis="secondary"
          />
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel panel-pad">
          <p className="section-label">Repairs pipeline</p>
          {repairEntries.length === 0 ? (
            <p className="mt-3 muted-sm">No open repairs.</p>
          ) : (
            <ul className="mt-3 divide-y">
              {repairEntries.map(([status, count]) => (
                <li
                  key={status}
                  className="flex items-center justify-between gap-3 py-2 text-sm"
                >
                  <StatusBadge tone={repairTone(status)}>
                    {REPAIR_STATUS_LABELS[status as RepairStatus] ?? status}
                  </StatusBadge>
                  <span className="tabular-nums text-base font-semibold">
                    {count}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel panel-pad">
          <div className="flex items-center justify-between gap-2">
            <p className="section-label">Ready for pickup</p>
            {summary.ready_for_pickup.length > 0 ? (
              <Link
                href={APP_ROUTES.repairs}
                className="text-xs text-muted-foreground underline-offset-4 hover:underline"
              >
                View all
              </Link>
            ) : null}
          </div>
          {summary.ready_for_pickup.length === 0 ? (
            <p className="mt-3 muted-sm">None waiting.</p>
          ) : (
            <ul className="mt-2 divide-y">
              {summary.ready_for_pickup.map((row) => (
                <li key={row.id}>
                  <Link
                    href={repairPath(row.id)}
                    className="flex items-center justify-between gap-3 py-2 text-sm transition-colors hover:bg-muted/40"
                  >
                    <span className="min-w-0">
                      <span className="font-mono text-xs font-medium">
                        {row.ticket_number}
                      </span>
                      <span className="mt-0.5 block truncate text-muted-foreground">
                        {customerName(row.first_name, row.last_name)}
                      </span>
                    </span>
                    <span className="money-cell shrink-0 font-medium">
                      {money(row.total)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {isTech && summary.assigned_jobs ? (
        <section className="panel overflow-hidden">
          <div className="panel-pad pb-0">
            <p className="section-label">My assigned jobs</p>
          </div>
          {summary.assigned_jobs.length === 0 ? (
            <EmptyState
              icon={Wrench}
              title="No assigned jobs"
              description="Open repairs assigned to you will appear here."
              className="min-h-40 border-0"
            />
          ) : (
            <div className="overflow-x-auto">
              <Table className="table-dense">
                <TableHeader>
                  <TableRow>
                    <TableHead>Ticket</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Issue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.assigned_jobs.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell className="font-mono text-xs">
                        <Link
                          href={repairPath(job.id)}
                          className="underline-offset-4 hover:underline"
                        >
                          {job.ticket_number}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={repairTone(job.status)}>
                          {REPAIR_STATUS_LABELS[job.status as RepairStatus] ??
                            job.status}
                        </StatusBadge>
                      </TableCell>
                      <TableCell className="capitalize text-muted-foreground">
                        {job.priority}
                      </TableCell>
                      <TableCell className="max-w-48 truncate text-muted-foreground">
                        {job.reported_issue ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      ) : null}

      {showFinancial && summary.outstanding_repairs ? (
        <section className="panel overflow-hidden">
          <div className="panel-pad pb-0">
            <p className="section-label">Outstanding balances</p>
          </div>
          {summary.outstanding_repairs.length === 0 ? (
            <p className="panel-pad muted-sm">No outstanding repair balances.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table className="table-dense">
                <TableHeader>
                  <TableRow>
                    <TableHead>Ticket</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.outstanding_repairs.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs">
                        <Link
                          href={repairPath(row.id)}
                          className="underline-offset-4 hover:underline"
                        >
                          {row.ticket_number}
                        </Link>
                      </TableCell>
                      <TableCell className="money-cell">{money(row.total)}</TableCell>
                      <TableCell className="money-cell text-muted-foreground">
                        {money(row.paid)}
                      </TableCell>
                      <TableCell className="money-cell font-medium">
                        {money(row.outstanding)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      ) : null}

      {showFinancial && summary.recent_sales ? (
        <section className="panel overflow-hidden">
          <div className="panel-pad pb-0">
            <p className="section-label">Recent sales</p>
          </div>
          {summary.recent_sales.length === 0 ? (
            <EmptyState
              icon={ShoppingBag}
              title="No sales yet"
              description="Completed sales will show here."
              action={
                canAccess(role, "pos")
                  ? { label: "Open POS", href: APP_ROUTES.pos }
                  : undefined
              }
              className="min-h-40 border-0"
            />
          ) : (
            <div className="overflow-x-auto">
              <Table className="table-dense">
                <TableHeader>
                  <TableRow>
                    <TableHead>Sale</TableHead>
                    <TableHead>Completed</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.recent_sales.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs">
                        <Link
                          href={salePath(row.id)}
                          className="underline-offset-4 hover:underline"
                        >
                          {row.sale_number}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDisplayDateTime(row.completed_at, timezone)}
                      </TableCell>
                      <TableCell className="money-cell">
                        {money(row.total)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      ) : null}

      {isOwnerAdmin && summary.inventory?.low_stock_items?.length ? (
        <section className="panel overflow-hidden">
          <div className="panel-pad pb-0">
            <p className="section-label flex items-center gap-2">
              <AlertTriangle className="size-3.5 text-amber-600" />
              Inventory alerts
            </p>
          </div>
          <div className="overflow-x-auto">
            <Table className="table-dense">
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.inventory.low_stock_items.map((item) => (
                  <TableRow key={item.product_id}>
                    <TableCell>
                      <Link
                        href={productPath(item.product_id)}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {item.name ?? "Product"}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {item.sku ?? "—"}
                    </TableCell>
                    <TableCell className="money-cell">
                      {item.quantity ?? "—"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        tone={
                          item.stock_status === "out_of_stock" ? "stop" : "wait"
                        }
                      >
                        {item.stock_status === "out_of_stock"
                          ? "Out of stock"
                          : "Low stock"}
                      </StatusBadge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : null}
    </div>
  )
}

import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, FileText } from "lucide-react"

import { PageHeader } from "@/components/app/page-header"
import { type StatusTone } from "@/components/app/status-badge"
import {
  SaleCancelPanel,
  VoidPaymentButton,
} from "@/features/sales/components/sale-actions-panel"
import { getSaleDetail } from "@/features/sales/queries"
import { displayName } from "@/lib/auth/labels"
import { canPerform } from "@/lib/auth/permissions"
import { requirePageAccess } from "@/lib/auth/workspace"
import { formatDisplayDateTime } from "@/lib/datetime/format"
import { formatCurrency } from "@/lib/money/currency"
import {
  saleReceiptPath,
  saleRefundPath,
} from "@/lib/navigation/feature-paths"
import { APP_ROUTES } from "@/lib/navigation/paths"
import {
  PAYMENT_METHOD_LABELS,
  SALE_STATUS_LABELS,
  type PaymentMethod,
  type SaleStatus,
} from "@/lib/sales/constants"
import { buttonVariants } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Sale" }

function statusTone(status: SaleStatus): StatusTone {
  if (status === "cancelled") return "stop"
  if (status === "refunded" || status === "partially_refunded") return "wait"
  if (status === "held") return "info"
  if (status === "completed") return "ready"
  return "neutral"
}

export default async function SaleDetailPage({
  params,
}: {
  params: Promise<{ saleId: string }>
}) {
  const session = await requirePageAccess("sales")
  const { saleId } = await params
  const detail = await getSaleDetail(saleId)
  if (!detail || detail.sale.shop_id !== session.shop.id) notFound()

  const { sale, items, customer, payments, refunds, paidTotal, cashier } = detail
  const status = sale.status as SaleStatus
  const { currencyCode, currencyLocale, timezone } = session.shopSettings
  const canRefund = canPerform(session.role, "refundSales")
  const title = sale.sale_number ?? sale.id.slice(0, 8)
  const when = sale.completed_at ?? sale.held_at ?? sale.created_at

  return (
    <div className="page-stack">
      <Link
        href={APP_ROUTES.sales}
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "-ml-2 w-fit"
        )}
      >
        <ArrowLeft className="size-4" />
        Sales
      </Link>

      <PageHeader
        eyebrow="Sale"
        title={title}
        description={
          customer
            ? customer.is_walk_in
              ? "Walk-in customer"
              : displayName(
                  customer.first_name,
                  customer.last_name,
                  "Customer"
                )
            : "No customer"
        }
        icon={FileText}
        badge={{
          label: SALE_STATUS_LABELS[status],
          tone: statusTone(status),
        }}
        actions={
          <div className="flex flex-wrap gap-2">
            {status !== "held" && status !== "cancelled" ? (
              <Link
                href={saleReceiptPath(sale.id)}
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "btn-h h-10 px-4"
                )}
              >
                Receipt
              </Link>
            ) : null}
            {canRefund &&
            (status === "completed" || status === "partially_refunded") ? (
              <Link
                href={saleRefundPath(sale.id)}
                className={cn(buttonVariants(), "btn-h h-10 px-4")}
              >
                Refund
              </Link>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <div className="panel panel-pad text-sm">
          <p className="text-muted-foreground">Total</p>
          <p className="mt-1 font-heading text-2xl tabular-nums">
            {formatCurrency(sale.total, currencyCode, currencyLocale)}
          </p>
        </div>
        <div className="panel panel-pad text-sm">
          <p className="text-muted-foreground">Paid (net)</p>
          <p className="mt-1 font-heading text-2xl tabular-nums">
            {formatCurrency(paidTotal, currencyCode, currencyLocale)}
          </p>
        </div>
        <div className="panel panel-pad text-sm">
          <p className="text-muted-foreground">Cashier</p>
          <p className="mt-1 font-heading text-lg">
            {cashier
              ? displayName(
                  cashier.first_name,
                  cashier.last_name,
                  "Cashier"
                )
              : "—"}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatDisplayDateTime(when, timezone)}
          </p>
        </div>
      </div>

      <div className="panel overflow-x-auto">
        <Table className="table-dense">
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Discount</TableHead>
              <TableHead className="text-right">Tax</TableHead>
              <TableHead className="text-right">Line</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">
                  {item.description_snapshot}
                </TableCell>
                <TableCell className="money-cell">{item.quantity}</TableCell>
                <TableCell className="money-cell">
                  {formatCurrency(item.unit_price, currencyCode, currencyLocale)}
                </TableCell>
                <TableCell className="money-cell">
                  {formatCurrency(
                    item.discount_amount,
                    currencyCode,
                    currencyLocale
                  )}
                </TableCell>
                <TableCell className="money-cell">
                  {formatCurrency(item.tax_amount, currencyCode, currencyLocale)}
                </TableCell>
                <TableCell className="money-cell">
                  {formatCurrency(item.line_total, currencyCode, currencyLocale)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="panel panel-pad">
          <h2 className="font-heading text-lg">Totals</h2>
          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="money-cell">
                {formatCurrency(sale.subtotal, currencyCode, currencyLocale)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Discount</dt>
              <dd className="money-cell">
                {formatCurrency(
                  sale.discount_amount,
                  currencyCode,
                  currencyLocale
                )}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Tax</dt>
              <dd className="money-cell">
                {formatCurrency(sale.tax_amount, currencyCode, currencyLocale)}
              </dd>
            </div>
            <div className="flex justify-between gap-4 font-medium">
              <dt>Total</dt>
              <dd className="money-cell">
                {formatCurrency(sale.total, currencyCode, currencyLocale)}
              </dd>
            </div>
            {Number(sale.change_amount) > 0 ? (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Change</dt>
                <dd className="money-cell">
                  {formatCurrency(
                    sale.change_amount,
                    currencyCode,
                    currencyLocale
                  )}
                </dd>
              </div>
            ) : null}
          </dl>
          {sale.notes ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Notes: {sale.notes}
            </p>
          ) : null}
        </div>

        <div className="panel panel-pad">
          <h2 className="font-heading text-lg">Payments</h2>
          {payments.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No payments yet.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {payments.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border/80 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="font-medium">
                      {PAYMENT_METHOD_LABELS[p.method as PaymentMethod]} ·{" "}
                      {p.entry_type}
                      {p.voided_at ? " (voided)" : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <span className="tabular-nums">
                        {formatCurrency(p.amount, currencyCode, currencyLocale)}
                      </span>
                      {p.tendered_amount != null
                        ? ` · tendered ${formatCurrency(p.tendered_amount, currencyCode, currencyLocale)}`
                        : ""}
                      {Number(p.change_amount) > 0
                        ? ` · change ${formatCurrency(p.change_amount, currencyCode, currencyLocale)}`
                        : ""}
                    </p>
                  </div>
                  {canRefund && !p.voided_at && p.entry_type === "receipt" ? (
                    <VoidPaymentButton paymentId={p.id} saleId={sale.id} />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {refunds.length > 0 ? (
        <div className="panel panel-pad">
          <h2 className="font-heading text-lg">Refunds</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {refunds.map((r) => (
              <li
                key={r.id}
                className="rounded-lg border border-border/80 px-3 py-2"
              >
                <p className="font-medium">
                  <span className="tabular-nums">
                    {formatCurrency(r.total, currencyCode, currencyLocale)}
                  </span>{" "}
                  · {r.reason}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDisplayDateTime(r.created_at, timezone)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {(status === "held" ||
        ((status === "completed" || status === "partially_refunded") &&
          canRefund)) && (
        <SaleCancelPanel saleId={sale.id} status={status} />
      )}
    </div>
  )
}

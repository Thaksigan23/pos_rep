import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ClipboardList } from "lucide-react"

import { PageHeader } from "@/components/app/page-header"
import { StatusBadge, type StatusTone } from "@/components/app/status-badge"
import { buttonVariants } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { PurchaseReceivePanel } from "@/features/purchases/components/purchase-receive-panel"
import { getPurchaseDetail } from "@/features/purchases/queries"
import { requirePageAccess } from "@/lib/auth/workspace"
import {
  formatDisplayDate,
  formatDisplayDateTime,
} from "@/lib/datetime/format"
import {
  MOVEMENT_TYPE_LABELS,
  PURCHASE_STATUS_LABELS,
  type InventoryMovementType,
  type PurchaseStatus,
} from "@/lib/inventory/constants"
import { formatCurrency } from "@/lib/money/currency"
import { productPath, supplierPath } from "@/lib/navigation/feature-paths"
import { APP_ROUTES } from "@/lib/navigation/paths"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Purchase" }

function purchaseTone(status: PurchaseStatus): StatusTone {
  if (status === "received") return "ready"
  if (status === "partially_received") return "wait"
  if (status === "cancelled") return "stop"
  return "info"
}

export default async function PurchaseDetailPage({
  params,
}: {
  params: Promise<{ purchaseId: string }>
}) {
  const session = await requirePageAccess("purchases")
  const { purchaseId } = await params
  const detail = await getPurchaseDetail(purchaseId)
  if (!detail) notFound()

  const { purchase, items, movements, payableTotal, paidTotal, outstanding } =
    detail
  const { currencyCode, currencyLocale, timezone } = session.shopSettings
  const supplier = Array.isArray(purchase.suppliers)
    ? purchase.suppliers[0]
    : purchase.suppliers
  const shop = Array.isArray(purchase.shops) ? purchase.shops[0] : purchase.shops
  const status = purchase.status as PurchaseStatus

  return (
    <div className="page-stack">
      <Link
        href={APP_ROUTES.purchases}
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "-ml-2 w-fit"
        )}
      >
        <ArrowLeft className="size-4" />
        Purchases
      </Link>

      <PageHeader
        eyebrow={purchase.purchase_number}
        title={supplier?.name ?? "Purchase"}
        description={`${shop?.name ?? "Shop"} · ordered ${formatDisplayDate(purchase.order_date, timezone)}`}
        icon={ClipboardList}
        badge={{
          label: PURCHASE_STATUS_LABELS[status],
          tone: purchaseTone(status),
        }}
      />

      <div className="panel panel-pad grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div>
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="font-heading text-lg tabular-nums">
            {formatCurrency(purchase.total, currencyCode, currencyLocale)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Payable</p>
          <p className="font-heading text-lg tabular-nums">
            {formatCurrency(payableTotal, currencyCode, currencyLocale)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Paid</p>
          <p className="font-heading text-lg tabular-nums">
            {formatCurrency(paidTotal, currencyCode, currencyLocale)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Outstanding</p>
          <p className="font-heading text-lg tabular-nums">
            {formatCurrency(outstanding, currencyCode, currencyLocale)}
          </p>
        </div>
      </div>

      {supplier ? (
        <p className="text-sm">
          Supplier:{" "}
          <Link
            href={supplierPath(supplier.id)}
            className="font-medium underline-offset-4 hover:underline"
          >
            {supplier.name}
          </Link>
        </p>
      ) : null}

      {purchase.received_at ? (
        <p className="text-sm text-muted-foreground">
          Fully received{" "}
          {formatDisplayDateTime(purchase.received_at, timezone)}
        </p>
      ) : null}

      <section className="panel panel-pad">
        <h2 className="mb-4 font-heading text-lg">Line items</h2>
        <div className="overflow-x-auto">
          <Table className="table-dense">
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Ordered</TableHead>
                <TableHead className="text-right">Received</TableHead>
                <TableHead className="text-right">Remaining</TableHead>
                <TableHead className="text-right">Unit cost</TableHead>
                <TableHead className="text-right">Line total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const product = Array.isArray(item.products)
                  ? item.products[0]
                  : item.products
                const ordered = Number(item.quantity_ordered)
                const received = Number(item.quantity_received)
                const remaining = Math.max(0, ordered - received)
                return (
                  <TableRow key={item.id}>
                    <TableCell>
                      {product ? (
                        <Link
                          href={productPath(product.id)}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {product.name}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="money-cell">{ordered}</TableCell>
                    <TableCell className="money-cell">{received}</TableCell>
                    <TableCell className="money-cell">{remaining}</TableCell>
                    <TableCell className="money-cell">
                      {formatCurrency(
                        item.unit_cost,
                        currencyCode,
                        currencyLocale
                      )}
                    </TableCell>
                    <TableCell className="money-cell">
                      {formatCurrency(
                        item.line_total,
                        currencyCode,
                        currencyLocale
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="panel panel-pad">
        <h2 className="mb-4 font-heading text-lg">Receive stock</h2>
        <PurchaseReceivePanel
          purchaseId={purchaseId}
          status={purchase.status}
          items={items.map((item) => {
            const product = Array.isArray(item.products)
              ? item.products[0]
              : item.products
            return {
              id: item.id,
              quantity_ordered: Number(item.quantity_ordered),
              quantity_received: Number(item.quantity_received),
              productName: product?.name ?? "Product",
            }
          })}
        />
      </section>

      <section className="panel panel-pad">
        <h2 className="mb-4 font-heading text-lg">Inventory impact</h2>
        {movements.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No purchase movements yet. Receive stock to create ledger rows.
          </p>
        ) : (
          <ul className="space-y-2 text-sm">
            {movements.map((m) => {
              const product = Array.isArray(m.products)
                ? m.products[0]
                : m.products
              return (
                <li
                  key={m.id}
                  className="flex flex-wrap justify-between gap-2 rounded-xl border px-3 py-2"
                >
                  <span>
                    {product?.name ?? "Product"} ·{" "}
                    {
                      MOVEMENT_TYPE_LABELS[
                        m.movement_type as InventoryMovementType
                      ]
                    }
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    +{Number(m.quantity_change)} ·{" "}
                    {formatDisplayDateTime(m.created_at, timezone)}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <StatusBadge tone={purchaseTone(status)}>
        {PURCHASE_STATUS_LABELS[status]}
      </StatusBadge>
    </div>
  )
}

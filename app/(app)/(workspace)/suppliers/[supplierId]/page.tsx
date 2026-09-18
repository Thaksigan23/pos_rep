import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Truck } from "lucide-react"

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
import { SupplierForm } from "@/features/suppliers/components/supplier-form"
import { getSupplierDetail } from "@/features/suppliers/queries"
import { requirePageAccess } from "@/lib/auth/workspace"
import { formatDisplayDate } from "@/lib/datetime/format"
import {
  PURCHASE_STATUS_LABELS,
  type PurchaseStatus,
} from "@/lib/inventory/constants"
import { formatCurrency } from "@/lib/money/currency"
import {
  productPath,
  purchaseNewPath,
  purchasePath,
} from "@/lib/navigation/feature-paths"
import { APP_ROUTES } from "@/lib/navigation/paths"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Supplier" }

function purchaseTone(status: PurchaseStatus): StatusTone {
  if (status === "received") return "ready"
  if (status === "partially_received") return "wait"
  if (status === "cancelled") return "stop"
  return "info"
}

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ supplierId: string }>
}) {
  const session = await requirePageAccess("suppliers")
  const { supplierId } = await params
  const detail = await getSupplierDetail(supplierId)
  if (!detail) notFound()

  const { currencyCode, currencyLocale, timezone } = session.shopSettings
  const balanceMap = new Map(
    detail.balances.map((b) => [b.purchaseId, b.outstanding])
  )
  const outstandingTotal = detail.balances.reduce(
    (sum, b) => sum + b.outstanding,
    0
  )

  return (
    <div className="page-stack">
      <Link
        href={APP_ROUTES.suppliers}
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "-ml-2 w-fit"
        )}
      >
        <ArrowLeft className="size-4" />
        Suppliers
      </Link>
      <PageHeader
        eyebrow="Supplier"
        title={detail.supplier.name}
        description={[detail.supplier.phone, detail.supplier.email]
          .filter(Boolean)
          .join(" · ")}
        icon={Truck}
        badge={{
          label: detail.supplier.is_active ? "Active" : "Inactive",
          tone: detail.supplier.is_active ? "ready" : "neutral",
        }}
        actions={
          <Link
            href={purchaseNewPath()}
            className={cn(buttonVariants(), "btn-h h-10 px-4")}
          >
            New purchase
          </Link>
        }
      />

      <div className="panel panel-pad text-sm">
        Outstanding across purchases:{" "}
        <span className="font-heading text-lg tabular-nums">
          {formatCurrency(outstandingTotal, currencyCode, currencyLocale)}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel panel-pad">
          <h2 className="mb-4 font-heading text-lg">Details</h2>
          <SupplierForm
            mode="edit"
            supplierId={supplierId}
            defaults={{
              name: detail.supplier.name,
              contactPerson: detail.supplier.contact_person ?? "",
              phone: detail.supplier.phone ?? "",
              email: detail.supplier.email ?? "",
              address: detail.supplier.address ?? "",
              notes: detail.supplier.notes ?? "",
              isActive: detail.supplier.is_active,
            }}
          />
        </section>

        <section className="panel panel-pad">
          <h2 className="font-heading text-lg">Linked products</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {detail.products.length === 0 ? (
              <li className="text-muted-foreground">No products linked.</li>
            ) : (
              detail.products.map((p) => (
                <li key={p.id}>
                  <Link
                    href={productPath(p.id)}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {p.name}
                  </Link>{" "}
                  <span className="font-mono text-xs text-muted-foreground">
                    {p.sku}
                  </span>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>

      <section className="panel panel-pad">
        <h2 className="font-heading text-lg">Purchase history</h2>
        {detail.purchases.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No purchases yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <Table className="table-dense">
              <TableHeader>
                <TableRow>
                  <TableHead>Purchase #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.purchases.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link
                        href={purchasePath(p.id)}
                        className="font-mono text-xs font-medium underline-offset-4 hover:underline"
                      >
                        {p.purchase_number}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDisplayDate(p.order_date, timezone)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        tone={purchaseTone(p.status as PurchaseStatus)}
                      >
                        {PURCHASE_STATUS_LABELS[p.status as PurchaseStatus]}
                      </StatusBadge>
                    </TableCell>
                    <TableCell className="money-cell">
                      {formatCurrency(p.total, currencyCode, currencyLocale)}
                    </TableCell>
                    <TableCell className="money-cell">
                      {formatCurrency(
                        balanceMap.get(p.id) ?? 0,
                        currencyCode,
                        currencyLocale
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  )
}

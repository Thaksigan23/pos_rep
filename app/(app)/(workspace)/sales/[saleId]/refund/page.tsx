import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { forbidden } from "next/navigation"

import { PageHeader } from "@/components/app/page-header"
import { SaleRefundForm } from "@/features/sales/components/sale-refund-form"
import { getSaleDetail } from "@/features/sales/queries"
import { canPerform } from "@/lib/auth/permissions"
import { requirePageAccess } from "@/lib/auth/workspace"
import { salePath } from "@/lib/navigation/feature-paths"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Refund sale" }

export default async function SaleRefundPage({
  params,
}: {
  params: Promise<{ saleId: string }>
}) {
  const session = await requirePageAccess("sales")
  if (!canPerform(session.role, "refundSales")) {
    forbidden()
  }

  const { saleId } = await params
  const detail = await getSaleDetail(saleId)
  if (!detail || detail.sale.shop_id !== session.shop.id) notFound()

  const { sale, items, refunds } = detail
  if (sale.status !== "completed" && sale.status !== "partially_refunded") {
    notFound()
  }

  const refundedByItem = new Map<string, number>()
  for (const refund of refunds) {
    for (const ri of refund.refund_items ?? []) {
      refundedByItem.set(
        ri.sale_item_id,
        (refundedByItem.get(ri.sale_item_id) ?? 0) + Number(ri.quantity)
      )
    }
  }

  const { currencyCode, currencyLocale } = session.shopSettings
  const title = sale.sale_number ?? sale.id.slice(0, 8)

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Refund"
        title={title}
        description="Select quantities to refund. Inventory returns for tracked products."
        actions={
          <Link
            href={salePath(sale.id)}
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Back to sale
          </Link>
        }
      />

      <SaleRefundForm
        saleId={sale.id}
        currencyCode={currencyCode}
        currencyLocale={currencyLocale}
        items={items.map((item) => ({
          id: item.id,
          description: item.description_snapshot,
          quantity: Number(item.quantity),
          refundedQty: refundedByItem.get(item.id) ?? 0,
          lineTotal: Number(item.line_total),
        }))}
      />
    </div>
  )
}

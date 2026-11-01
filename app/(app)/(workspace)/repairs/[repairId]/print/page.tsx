import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { buttonVariants } from "@/components/ui/button"
import { RepairSlipPrint } from "@/features/repairs/components/repair-slip-print"
import { getRepairJobDetail } from "@/features/repairs/queries"
import { getShopSettingsBundle } from "@/features/settings/queries"
import { displayName } from "@/lib/auth/labels"
import { requirePageAccess } from "@/lib/auth/workspace"
import { formatDisplayDateTime } from "@/lib/datetime/format"
import { formatCurrency } from "@/lib/money/currency"
import { repairPath } from "@/lib/navigation/feature-paths"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Repair slips" }

export default async function RepairPrintPage({
  params,
}: {
  params: Promise<{ repairId: string }>
}) {
  const session = await requirePageAccess("repairs")
  const { repairId } = await params
  const [detail, bundle] = await Promise.all([
    getRepairJobDetail(repairId, session.role),
    getShopSettingsBundle(session.shop.id),
  ])
  if (!detail || detail.job.shop_id !== session.shop.id) notFound()

  const { job } = detail
  const customer = Array.isArray(job.customers) ? job.customers[0] : job.customers
  const device = Array.isArray(job.customer_devices)
    ? job.customer_devices[0]
    : job.customer_devices
  const deviceName = device?.model_label || "Phone"
  const customerLabel = customer
    ? displayName(customer.first_name, customer.last_name, "Customer")
    : "Customer"
  const phone = customer?.phone || "—"
  const currencyCode =
    bundle?.settings.currency_code ?? session.shopSettings.currencyCode
  const currencyLocale =
    bundle?.settings.currency_locale ?? session.shopSettings.currencyLocale
  const price = formatCurrency(Number(job.total), currencyCode, currencyLocale)
  const when = formatDisplayDateTime(job.created_at, session.shopSettings.timezone)
  const shopName = bundle?.shop.name ?? session.shop.name

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Link
          href={repairPath(job.id)}
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          Back to repair
        </Link>
        <RepairSlipPrint />
      </div>
      <p className="max-w-xl text-sm text-muted-foreground print:hidden">
        The receipt goes to the customer. The sticker goes on the phone so the
        shop can tell whose device it is.
      </p>

      <div className="flex flex-wrap items-start gap-6">
        <article className="customer-slip mx-auto w-[80mm] bg-white p-3 text-black shadow-sm">
          <header className="text-center">
            {bundle?.settings.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={bundle.settings.logo_url}
                alt=""
                className="mx-auto mb-2 max-h-12 max-w-[48mm] object-contain"
              />
            ) : null}
            <h1 className="text-base font-bold leading-tight">{shopName}</h1>
            {bundle?.shop.phone ? (
              <p className="text-[11px]">{bundle.shop.phone}</p>
            ) : null}
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide">
              Repair receipt
            </p>
          </header>
          <div className="my-2 border-t border-dashed border-neutral-400" />
          <div className="space-y-0.5 text-[11px]">
            <p>
              <span className="font-semibold">Ticket:</span> {job.ticket_number}
            </p>
            <p>
              <span className="font-semibold">Date:</span> {when}
            </p>
            <p>
              <span className="font-semibold">Customer:</span> {customerLabel}
            </p>
            <p>
              <span className="font-semibold">Phone:</span> {phone}
            </p>
            <p>
              <span className="font-semibold">Device:</span> {deviceName}
            </p>
          </div>
          <div className="my-2 border-t border-dashed border-neutral-400" />
          <p className="text-[11px] whitespace-pre-wrap">{job.reported_issue}</p>
          <div className="my-2 border-t border-dashed border-neutral-400" />
          <p className="flex items-center justify-between text-sm font-bold">
            <span>Price</span>
            <span>{price}</span>
          </p>
          {bundle?.settings.receipt_footer ? (
            <p className="mt-3 text-center text-[10px] whitespace-pre-wrap">
              {bundle.settings.receipt_footer}
            </p>
          ) : (
            <p className="mt-3 text-center text-[10px]">
              Keep this receipt for collection.
            </p>
          )}
        </article>

        <article className="shop-sticker w-[50mm] border border-dashed border-neutral-400 bg-white p-2 text-black">
          <p className="text-[9px] font-semibold uppercase tracking-wide">
            {shopName}
          </p>
          <p className="mt-1 font-mono text-lg font-bold leading-none">
            {job.ticket_number}
          </p>
          <p className="mt-2 text-[11px] font-semibold leading-tight">
            {customerLabel}
          </p>
          <p className="text-[11px] leading-tight">{phone}</p>
          <p className="mt-1 text-[10px] leading-tight">{deviceName}</p>
        </article>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          html[data-print="customer-slip"] .customer-slip,
          html[data-print="customer-slip"] .customer-slip * { visibility: visible; }
          html[data-print="shop-sticker"] .shop-sticker,
          html[data-print="shop-sticker"] .shop-sticker * { visibility: visible; }
          html[data-print="customer-slip"] .customer-slip,
          html[data-print="shop-sticker"] .shop-sticker {
            position: absolute;
            left: 0;
            top: 0;
            box-shadow: none;
            background: white;
            color: black;
          }
          html[data-print="customer-slip"] .customer-slip { width: 80mm; }
          html[data-print="shop-sticker"] .shop-sticker { width: 50mm; }
        }
      `}</style>
    </div>
  )
}

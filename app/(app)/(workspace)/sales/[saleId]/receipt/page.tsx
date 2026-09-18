import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { ReceiptPrintButton } from "@/features/sales/components/receipt-print-button"
import { getReceiptData } from "@/features/sales/queries"
import { displayName } from "@/lib/auth/labels"
import { requirePageAccess } from "@/lib/auth/workspace"
import { formatDisplayDateTime } from "@/lib/datetime/format"
import { formatCurrency } from "@/lib/money/currency"
import { salePath } from "@/lib/navigation/feature-paths"
import {
  PAYMENT_METHOD_LABELS,
  type PaymentMethod,
} from "@/lib/sales/constants"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Receipt" }

export default async function SaleReceiptPage({
  params,
}: {
  params: Promise<{ saleId: string }>
}) {
  const session = await requirePageAccess("sales")
  const { saleId } = await params
  const data = await getReceiptData(saleId)
  if (!data || data.sale.shop_id !== session.shop.id) notFound()

  const { sale, items, customer, shop, settings, payments, cashier } = data
  const currencyCode =
    settings?.currency_code ?? session.shopSettings.currencyCode
  const currencyLocale =
    settings?.currency_locale ?? session.shopSettings.currencyLocale
  const timezone = session.shopSettings.timezone
  const taxLabel = settings?.tax_label ?? "Tax"
  const cashPayment = payments.find(
    (p) => p.method === "cash" && p.entry_type === "receipt"
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Link
          href={salePath(sale.id)}
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          Back to sale
        </Link>
        <ReceiptPrintButton />
      </div>

      <article className="receipt mx-auto max-w-[80mm] bg-white p-3 text-black shadow-sm print:max-w-none print:shadow-none">
        <header className="text-center">
          {settings &&
          "logo_url" in settings &&
          settings.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={settings.logo_url as string}
              alt=""
              className="mx-auto mb-2 max-h-12 max-w-[48mm] object-contain"
            />
          ) : null}
          <h1 className="text-base font-bold leading-tight">
            {shop?.name ?? session.shop.name}
          </h1>
          {shop?.address ? (
            <p className="mt-1 text-[11px] leading-snug whitespace-pre-wrap">
              {shop.address}
            </p>
          ) : null}
          {shop?.phone ? (
            <p className="text-[11px]">{shop.phone}</p>
          ) : null}
          {shop?.email ? (
            <p className="text-[11px]">{shop.email}</p>
          ) : null}
          {settings?.tax_id ? (
            <p className="text-[11px]">Tax ID: {settings.tax_id}</p>
          ) : null}
          {settings?.business_registration ? (
            <p className="text-[11px]">
              Reg: {settings.business_registration}
            </p>
          ) : null}
        </header>

        <div className="my-2 border-t border-dashed border-neutral-400" />

        <div className="space-y-0.5 text-[11px]">
          <p>
            <span className="font-semibold">Sale:</span>{" "}
            {sale.sale_number ?? sale.id.slice(0, 8)}
          </p>
          <p>
            <span className="font-semibold">Date:</span>{" "}
            {formatDisplayDateTime(
              sale.completed_at ?? sale.created_at,
              timezone
            )}
          </p>
          <p>
            <span className="font-semibold">Customer:</span>{" "}
            {customer
              ? customer.is_walk_in
                ? "Walk-in"
                : displayName(
                    customer.first_name,
                    customer.last_name,
                    "Customer"
                  )
              : "—"}
          </p>
          {cashier ? (
            <p>
              <span className="font-semibold">Cashier:</span>{" "}
              {displayName(cashier.first_name, cashier.last_name, "Cashier")}
            </p>
          ) : null}
        </div>

        <div className="my-2 border-t border-dashed border-neutral-400" />

        <ul className="space-y-2 text-[11px]">
          {items.map((item) => (
            <li key={item.id}>
              <div className="flex justify-between gap-2 font-medium">
                <span className="min-w-0 flex-1">{item.description_snapshot}</span>
                <span>
                  {formatCurrency(item.line_total, currencyCode, currencyLocale)}
                </span>
              </div>
              <p className="text-neutral-600">
                {item.quantity} ×{" "}
                {formatCurrency(item.unit_price, currencyCode, currencyLocale)}
                {Number(item.discount_amount) > 0
                  ? ` − disc ${formatCurrency(item.discount_amount, currencyCode, currencyLocale)}`
                  : ""}
              </p>
            </li>
          ))}
        </ul>

        <div className="my-2 border-t border-dashed border-neutral-400" />

        <dl className="space-y-0.5 text-[11px]">
          <div className="flex justify-between">
            <dt>Subtotal</dt>
            <dd>
              {formatCurrency(sale.subtotal, currencyCode, currencyLocale)}
            </dd>
          </div>
          {Number(sale.discount_amount) > 0 ? (
            <div className="flex justify-between">
              <dt>Discount</dt>
              <dd>
                {formatCurrency(
                  sale.discount_amount,
                  currencyCode,
                  currencyLocale
                )}
              </dd>
            </div>
          ) : null}
          <div className="flex justify-between">
            <dt>{taxLabel}</dt>
            <dd>
              {formatCurrency(sale.tax_amount, currencyCode, currencyLocale)}
            </dd>
          </div>
          <div className="flex justify-between text-sm font-bold">
            <dt>Total</dt>
            <dd>
              {formatCurrency(sale.total, currencyCode, currencyLocale)}
            </dd>
          </div>
        </dl>

        {payments.length > 0 ? (
          <>
            <div className="my-2 border-t border-dashed border-neutral-400" />
            <ul className="space-y-0.5 text-[11px]">
              {payments.map((p) => (
                <li key={p.id} className="flex justify-between gap-2">
                  <span>
                    {PAYMENT_METHOD_LABELS[p.method as PaymentMethod]} (
                    {p.entry_type})
                  </span>
                  <span>
                    {formatCurrency(p.amount, currencyCode, currencyLocale)}
                  </span>
                </li>
              ))}
            </ul>
            {cashPayment?.tendered_amount != null ? (
              <p className="mt-1 flex justify-between text-[11px]">
                <span>Tendered</span>
                <span>
                  {formatCurrency(
                    cashPayment.tendered_amount,
                    currencyCode,
                    currencyLocale
                  )}
                </span>
              </p>
            ) : null}
            {Number(sale.change_amount) > 0 ||
            Number(cashPayment?.change_amount ?? 0) > 0 ? (
              <p className="mt-1 flex justify-between text-[11px]">
                <span>Change</span>
                <span>
                  {formatCurrency(
                    Number(sale.change_amount) ||
                      Number(cashPayment?.change_amount ?? 0),
                    currencyCode,
                    currencyLocale
                  )}
                </span>
              </p>
            ) : null}
          </>
        ) : null}

        {settings?.default_warranty_days != null &&
        settings.default_warranty_days > 0 ? (
          <>
            <div className="my-2 border-t border-dashed border-neutral-400" />
            <p className="text-center text-[10px]">
              Standard warranty: {settings.default_warranty_days} days where
              applicable.
            </p>
          </>
        ) : null}

        {settings?.receipt_footer ? (
          <>
            <div className="my-2 border-t border-dashed border-neutral-400" />
            <p className="text-center text-[10px] whitespace-pre-wrap">
              {settings.receipt_footer}
            </p>
          </>
        ) : (
          <>
            <div className="my-2 border-t border-dashed border-neutral-400" />
            <p className="text-center text-[10px]">Thank you for your purchase.</p>
          </>
        )}
      </article>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          .receipt, .receipt * { visibility: visible; }
          .receipt {
            position: absolute;
            left: 0;
            top: 0;
            width: 80mm;
            box-shadow: none;
          }
        }
      `}</style>
    </div>
  )
}

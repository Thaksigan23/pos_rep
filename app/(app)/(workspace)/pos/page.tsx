import type { Metadata } from "next"

import { PosTerminal } from "@/features/sales/components/pos-terminal"
import { getWalkInCustomer } from "@/features/sales/queries"
import { requirePageAccess } from "@/lib/auth/workspace"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "POS" }

export default async function PosPage() {
  const session = await requirePageAccess("pos")
  const walkInCustomer = await getWalkInCustomer()
  const supabase = await createClient()
  const { data: settings } = await supabase
    .from("shop_settings")
    .select(
      "tax_enabled, tax_rate, tax_inclusive, currency_code, currency_locale, cashier_max_line_discount_percent"
    )
    .eq("shop_id", session.shop.id)
    .maybeSingle()

  return (
    <div className="-mx-4 -my-5 flex h-[calc(100svh-3.5rem)] min-w-0 flex-col overflow-hidden md:-mx-6 md:-my-6 lg:-mx-8">
      <PosTerminal
        walkInCustomer={walkInCustomer}
        shopId={session.shop.id}
        shopName={session.shop.name}
        currencyCode={
          settings?.currency_code ?? session.shopSettings.currencyCode
        }
        currencyLocale={
          settings?.currency_locale ?? session.shopSettings.currencyLocale
        }
        timezone={session.shopSettings.timezone}
        taxEnabled={settings?.tax_enabled ?? false}
        taxRate={Number(settings?.tax_rate ?? 0)}
        taxInclusive={settings?.tax_inclusive ?? false}
        cashierMaxLineDiscountPercent={Number(
          settings?.cashier_max_line_discount_percent ?? 0.1
        )}
      />
    </div>
  )
}

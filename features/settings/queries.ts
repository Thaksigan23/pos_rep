import "server-only"

import { createClient } from "@/lib/supabase/server"
import { signShopAssetPath } from "@/lib/storage/signed-urls"

export type ShopSettingsBundle = {
  shop: {
    id: string
    name: string
    phone: string | null
    email: string | null
    address: string | null
  }
  settings: {
    logo_path: string | null
    logo_url: string | null
    currency_code: string
    currency_locale: string
    timezone: string
    tax_enabled: boolean
    tax_rate: number
    tax_inclusive: boolean
    tax_label: string
    tax_id: string | null
    business_registration: string | null
    receipt_footer: string | null
    default_warranty_days: number
    low_stock_threshold: number
    allow_negative_stock: boolean
    allow_partial_payments: boolean
    cashier_max_line_discount_percent: number
    invoice_prefix: string
    repair_prefix: string
    purchase_prefix: string
    customer_prefix: string
    estimate_prefix: string
  }
}

export async function getShopSettingsBundle(
  shopId: string
): Promise<ShopSettingsBundle | null> {
  const supabase = await createClient()
  const [shopResult, settingsResult] = await Promise.all([
    supabase
      .from("shops")
      .select("id, name, phone, email, address")
      .eq("id", shopId)
      .maybeSingle(),
    supabase.from("shop_settings").select("*").eq("shop_id", shopId).maybeSingle(),
  ])

  if (!shopResult.data || !settingsResult.data) return null

  const s = settingsResult.data
  const logoUrl = await signShopAssetPath(s.logo_path)
  return {
    shop: shopResult.data,
    settings: {
      logo_path: s.logo_path,
      logo_url: logoUrl,
      currency_code: s.currency_code,
      currency_locale: s.currency_locale,
      timezone: s.timezone,
      tax_enabled: s.tax_enabled,
      tax_rate: Number(s.tax_rate),
      tax_inclusive: s.tax_inclusive,
      tax_label: s.tax_label,
      tax_id: s.tax_id,
      business_registration: s.business_registration,
      receipt_footer: s.receipt_footer,
      default_warranty_days: s.default_warranty_days,
      low_stock_threshold: Number(s.low_stock_threshold),
      allow_negative_stock: s.allow_negative_stock,
      allow_partial_payments: s.allow_partial_payments,
      cashier_max_line_discount_percent: Number(
        s.cashier_max_line_discount_percent
      ),
      invoice_prefix: s.invoice_prefix,
      repair_prefix: s.repair_prefix,
      purchase_prefix: s.purchase_prefix,
      customer_prefix: s.customer_prefix,
      estimate_prefix: s.estimate_prefix,
    },
  }
}

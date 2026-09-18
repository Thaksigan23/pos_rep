"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { canPerform } from "@/lib/auth/permissions"
import { requireWorkspaceSession } from "@/lib/auth/workspace"
import { APP_ROUTES } from "@/lib/navigation/paths"
import { createClient } from "@/lib/supabase/server"

export type ActionResult = { error: string } | { success: string }

const timezoneSchema = z
  .string()
  .trim()
  .min(1, "Timezone is required")
  .refine(
    (tz) => tz === "UTC" || tz.includes("/"),
    "Use an IANA timezone (e.g. Asia/Colombo) or UTC"
  )

const currencySchema = z
  .string()
  .trim()
  .transform((v) => v.toUpperCase())
  .refine((v) => /^[A-Z]{3}$/.test(v), "Currency must be a 3-letter code")

const settingsSchema = z.object({
  shopName: z.string().trim().min(1, "Shop name is required").max(120),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  email: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || z.string().email().safeParse(v).success, "Invalid email"),
  address: z.string().trim().max(500).optional().or(z.literal("")),
  timezone: timezoneSchema,
  currencyCode: currencySchema,
  currencyLocale: z.string().trim().min(2).max(20),
  taxEnabled: z.boolean(),
  taxRatePercent: z.number().min(0).max(100),
  taxInclusive: z.boolean(),
  taxLabel: z.string().trim().min(1).max(40),
  taxId: z.string().trim().max(80).optional().or(z.literal("")),
  businessRegistration: z.string().trim().max(120).optional().or(z.literal("")),
  receiptFooter: z.string().trim().max(500).optional().or(z.literal("")),
  defaultWarrantyDays: z.number().int().min(0).max(3650),
  lowStockThreshold: z.number().min(0),
  allowNegativeStock: z.boolean(),
  allowPartialPayments: z.boolean(),
  cashierMaxLineDiscountPercent: z.number().min(0).max(100),
  invoicePrefix: z.string().trim().min(1).max(20),
  repairPrefix: z.string().trim().min(1).max(20),
  purchasePrefix: z.string().trim().min(1).max(20),
  customerPrefix: z.string().trim().min(1).max(20),
  estimatePrefix: z.string().trim().min(1).max(20),
})

export async function updateShopSettingsAction(
  input: unknown
): Promise<ActionResult> {
  const session = await requireWorkspaceSession()
  if (!canPerform(session.role, "manageSettings")) {
    return { error: "Only owners and admins can update settings." }
  }

  const parsed = settingsSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check settings." }
  }

  const d = parsed.data
  const supabase = await createClient()
  const { error } = await supabase.rpc("update_shop_settings", {
    p_shop_id: session.shop.id,
    p_payload: {
      shop_name: d.shopName,
      phone: d.phone || "",
      email: d.email || "",
      address: d.address || "",
      timezone: d.timezone,
      currency_code: d.currencyCode,
      currency_locale: d.currencyLocale,
      tax_enabled: d.taxEnabled,
      tax_rate: d.taxRatePercent / 100,
      tax_inclusive: d.taxInclusive,
      tax_label: d.taxLabel,
      tax_id: d.taxId || "",
      business_registration: d.businessRegistration || "",
      receipt_footer: d.receiptFooter || "",
      default_warranty_days: d.defaultWarrantyDays,
      low_stock_threshold: d.lowStockThreshold,
      allow_negative_stock: d.allowNegativeStock,
      allow_partial_payments: d.allowPartialPayments,
      cashier_max_line_discount_percent: d.cashierMaxLineDiscountPercent / 100,
      invoice_prefix: d.invoicePrefix,
      repair_prefix: d.repairPrefix,
      purchase_prefix: d.purchasePrefix,
      customer_prefix: d.customerPrefix,
      estimate_prefix: d.estimatePrefix,
    },
  })

  if (error) {
    const msg = error.message.toLowerCase()
    if (msg.includes("invalid timezone")) return { error: "Invalid timezone." }
    if (msg.includes("invalid currency")) return { error: "Invalid currency code." }
    if (msg.includes("invalid tax rate")) return { error: "Invalid tax rate." }
    return { error: error.message }
  }

  revalidatePath(APP_ROUTES.settings)
  revalidatePath(APP_ROUTES.pos)
  revalidatePath(APP_ROUTES.dashboard)
  return { success: "Settings saved." }
}

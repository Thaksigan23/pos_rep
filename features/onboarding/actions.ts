"use server"

import { redirect } from "next/navigation"
import { z } from "zod"

import { APP_ROUTES } from "@/lib/navigation/paths"
import { createClient } from "@/lib/supabase/server"

const bootstrapSchema = z.object({
  businessName: z.string().trim().min(2).max(80),
  shopName: z.string().trim().max(80).optional(),
  currencyCode: z.enum(["LKR", "USD", "EUR", "GBP", "INR", "AED"]),
  timezone: z.string().min(1).max(64),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().email().optional().or(z.literal("")),
})

const LOCALE_BY_CURRENCY: Record<string, string> = {
  LKR: "en-LK",
  USD: "en-US",
  EUR: "en-IE",
  GBP: "en-GB",
  INR: "en-IN",
  AED: "en-AE",
}

export async function bootstrapOrganizationAction(
  input: unknown
): Promise<{ error: string } | void> {
  const parsed = bootstrapSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the shop details." }
  }

  const supabase = await createClient()
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) {
    return { error: "Sign in again to create the shop." }
  }

  const { data: existing } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", userData.user.id)
    .maybeSingle()

  if (existing?.organization_id) {
    redirect(APP_ROUTES.dashboard)
  }

  const { error: bootstrapError } = await supabase.rpc("bootstrap_organization", {
    p_name: parsed.data.businessName,
  })

  if (bootstrapError) {
    return { error: bootstrapError.message }
  }

  const { data: shop } = await supabase
    .from("shops")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()

  if (shop?.id) {
    const shopName = parsed.data.shopName?.trim() || "Main shop"
    await supabase
      .from("shops")
      .update({
        name: shopName,
        phone: parsed.data.phone || null,
        email: parsed.data.email || null,
      })
      .eq("id", shop.id)

    await supabase
      .from("shop_settings")
      .update({
        currency_code: parsed.data.currencyCode,
        currency_locale: LOCALE_BY_CURRENCY[parsed.data.currencyCode] ?? "en-LK",
        timezone: parsed.data.timezone,
      })
      .eq("shop_id", shop.id)
  }

  redirect(APP_ROUTES.dashboard)
}

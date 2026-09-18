import "server-only"

import { cache } from "react"
import { forbidden, redirect } from "next/navigation"

import { canAccess, type AppPage } from "@/lib/auth/permissions"
import { isAppRole } from "@/lib/auth/roles"
import type {
  AuthWorkspaceState,
  ShopSummary,
  WorkspaceSession,
} from "@/lib/auth/types"
import { AUTH_ROUTES, APP_ROUTES } from "@/lib/navigation/paths"
import { signShopAssetPath } from "@/lib/storage/signed-urls"
import { createClient } from "@/lib/supabase/server"

export const getAuthWorkspaceState = cache(
  async (): Promise<AuthWorkspaceState> => {
    const supabase = await createClient()
    const { data: userData, error: userError } = await supabase.auth.getUser()

    if (userError || !userData.user) {
      return { kind: "unauthenticated" }
    }

    const userId = userData.user.id
    const email = userData.user.email ?? null

    const { data: profile } = await supabase
      .from("profiles")
      .select(
        "id, first_name, last_name, phone, role, is_active, default_shop_id, organization_id"
      )
      .eq("id", userId)
      .maybeSingle()

    if (!profile?.organization_id || !isAppRole(profile.role)) {
      return { kind: "needs_onboarding", userId, email }
    }

    if (!profile.is_active) {
      // Workspace layout renders AccessDenied for inactive accounts.
      return { kind: "inactive", userId, email }
    }

    const [orgResult, shopsResult, membersResult] = await Promise.all([
      supabase
        .from("organizations")
        .select("id, name, slug")
        .eq("id", profile.organization_id)
        .maybeSingle(),
      supabase
        .from("shops")
        .select("id, name, phone, email, address")
        .eq("is_active", true)
        .order("created_at", { ascending: true }),
      supabase.from("shop_members").select("shop_id").eq("user_id", userId),
    ])

    const organization = orgResult.data
    const shops = (shopsResult.data ?? []) as ShopSummary[]

    if (!organization || shops.length === 0) {
      return { kind: "needs_onboarding", userId, email }
    }

    const memberShopIds = new Set((membersResult.data ?? []).map((row) => row.shop_id))
    // If default_shop was removed from membership, fall back to first accessible shop.
    const accessibleShops =
      profile.role === "owner" || profile.role === "admin"
        ? shops
        : memberShopIds.size > 0
          ? shops.filter((shop) => memberShopIds.has(shop.id))
          : shops.filter((shop) => shop.id === profile.default_shop_id)

    const fallbackShop = accessibleShops[0] ?? shops[0]
    const currentShop =
      accessibleShops.find((shop) => shop.id === profile.default_shop_id) ??
      fallbackShop

    if (!currentShop) {
      return { kind: "needs_onboarding", userId, email }
    }

    const { data: settings } = await supabase
      .from("shop_settings")
      .select("currency_code, currency_locale, timezone, logo_path")
      .eq("shop_id", currentShop.id)
      .maybeSingle()

    const logoPath = settings?.logo_path ?? null
    let logoUrl: string | null = null
    if (logoPath) {
      try {
        logoUrl = await signShopAssetPath(logoPath)
      } catch {
        logoUrl = null
      }
    }

    const session: WorkspaceSession = {
      userId,
      email,
      profile: {
        id: profile.id,
        firstName: profile.first_name,
        lastName: profile.last_name,
        phone: profile.phone,
        role: profile.role,
        isActive: profile.is_active,
        defaultShopId: profile.default_shop_id,
        organizationId: profile.organization_id,
      },
      role: profile.role,
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      },
      shop: currentShop,
      shopSettings: {
        currencyCode: settings?.currency_code ?? "LKR",
        currencyLocale: settings?.currency_locale ?? "en-LK",
        timezone: settings?.timezone ?? "Asia/Colombo",
        logoPath,
        logoUrl,
      },
      accessibleShops: accessibleShops.length > 0 ? accessibleShops : [currentShop],
    }

    return { kind: "ready", session }
  }
)

export async function requireWorkspaceSession(): Promise<WorkspaceSession> {
  const state = await getAuthWorkspaceState()

  if (state.kind === "unauthenticated") {
    redirect(AUTH_ROUTES.login)
  }

  if (state.kind === "needs_onboarding") {
    redirect(APP_ROUTES.onboarding)
  }

  if (state.kind === "inactive") {
    redirect(AUTH_ROUTES.login)
  }

  return state.session
}

export async function requirePageAccess(page: AppPage): Promise<WorkspaceSession> {
  const session = await requireWorkspaceSession()

  if (!canAccess(session.role, page)) {
    forbidden()
  }

  return session
}

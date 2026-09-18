import type { AppRole } from "@/lib/auth/roles"

export type ShopSummary = {
  id: string
  name: string
  phone: string | null
  email: string | null
  address: string | null
}

export type OrganizationSummary = {
  id: string
  name: string
  slug: string
}

export type ProfileSummary = {
  id: string
  firstName: string | null
  lastName: string | null
  phone: string | null
  role: AppRole
  isActive: boolean
  defaultShopId: string | null
  organizationId: string
}

export type ShopSettingsSummary = {
  currencyCode: string
  currencyLocale: string
  timezone: string
  /** Storage path in private shop-assets; null when unset. */
  logoPath: string | null
  /** Short-lived signed URL for shell display; null when missing/unavailable. */
  logoUrl: string | null
}

export type WorkspaceSession = {
  userId: string
  email: string | null
  profile: ProfileSummary
  role: AppRole
  organization: OrganizationSummary
  shop: ShopSummary
  shopSettings: ShopSettingsSummary
  accessibleShops: ShopSummary[]
}

export type AuthWorkspaceState =
  | { kind: "unauthenticated" }
  | { kind: "needs_onboarding"; userId: string; email: string | null }
  | { kind: "inactive"; userId: string; email: string | null }
  | { kind: "ready"; session: WorkspaceSession }

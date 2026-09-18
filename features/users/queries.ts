import "server-only"

import { canPerform } from "@/lib/auth/permissions"
import type { AppRole } from "@/lib/auth/roles"
import type { WorkspaceSession } from "@/lib/auth/types"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

export type StaffMember = {
  id: string
  firstName: string | null
  lastName: string | null
  phone: string | null
  role: AppRole
  isActive: boolean
  defaultShopId: string | null
  email: string | null
  shopIds: string[]
  shopNames: string[]
}

export type ShopOption = { id: string; name: string }

async function loadEmailMap(
  session: WorkspaceSession,
  userIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (
    userIds.length === 0 ||
    !canPerform(session.role, "manageUsers")
  ) {
    return map
  }

  try {
    const admin = createAdminClient()
    const { data, error } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    })
    if (error || !data?.users) return map
    const wanted = new Set(userIds)
    for (const user of data.users) {
      if (wanted.has(user.id) && user.email) {
        map.set(user.id, user.email)
      }
    }
  } catch {
    // Service key may be missing in local/dev — skip emails.
  }
  return map
}

export async function listStaff(
  session: WorkspaceSession
): Promise<StaffMember[]> {
  const supabase = await createClient()
  const [{ data: profiles }, { data: members }, { data: shops }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select(
          "id, first_name, last_name, phone, role, is_active, default_shop_id"
        )
        .eq("organization_id", session.organization.id)
        .order("first_name", { ascending: true }),
      supabase
        .from("shop_members")
        .select("user_id, shop_id")
        .eq("organization_id", session.organization.id),
      supabase
        .from("shops")
        .select("id, name")
        .eq("organization_id", session.organization.id)
        .eq("is_active", true),
    ])

  const shopNameById = new Map((shops ?? []).map((s) => [s.id, s.name]))
  const shopsByUser = new Map<string, string[]>()
  for (const m of members ?? []) {
    const list = shopsByUser.get(m.user_id) ?? []
    list.push(m.shop_id)
    shopsByUser.set(m.user_id, list)
  }

  const rows = profiles ?? []
  const emailMap = await loadEmailMap(
    session,
    rows.map((p) => p.id)
  )

  return rows.map((p) => {
    const shopIds = shopsByUser.get(p.id) ?? []
    return {
      id: p.id,
      firstName: p.first_name,
      lastName: p.last_name,
      phone: p.phone,
      role: p.role as AppRole,
      isActive: p.is_active,
      defaultShopId: p.default_shop_id,
      email: emailMap.get(p.id) ?? null,
      shopIds,
      shopNames: shopIds
        .map((id) => shopNameById.get(id))
        .filter((n): n is string => Boolean(n)),
    }
  })
}

export async function getStaffMember(
  session: WorkspaceSession,
  userId: string
): Promise<StaffMember | null> {
  const staff = await listStaff(session)
  return staff.find((s) => s.id === userId) ?? null
}

export async function listOrgShops(
  organizationId: string
): Promise<ShopOption[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("shops")
    .select("id, name")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("name")
  return data ?? []
}

import type { ReactNode } from "react"
import { redirect } from "next/navigation"

import { AccessDenied } from "@/components/app/access-denied"
import { AppShell } from "@/components/layout/app-shell"
import { countUnread } from "@/features/notifications/queries"
import { canAccess } from "@/lib/auth/permissions"
import { getAuthWorkspaceState } from "@/lib/auth/workspace"
import { AUTH_ROUTES, APP_ROUTES } from "@/lib/navigation/paths"
import { navigationForRole } from "@/lib/navigation/app-nav"

export default async function WorkspaceLayout({
  children,
}: {
  children: ReactNode
}) {
  const state = await getAuthWorkspaceState()

  if (state.kind === "unauthenticated") {
    redirect(AUTH_ROUTES.login)
  }

  if (state.kind === "needs_onboarding") {
    redirect(APP_ROUTES.onboarding)
  }

  if (state.kind === "inactive") {
    return (
      <AccessDenied
        title="Account disabled"
        description="This staff account is inactive. Ask an owner or admin to restore access."
        showSignOut
      />
    )
  }

  let unreadCount = 0
  if (canAccess(state.session.role, "notifications")) {
    try {
      unreadCount = await countUnread(state.session.userId)
    } catch {
      unreadCount = 0
    }
  }

  return (
    <AppShell
      session={state.session}
      sections={navigationForRole(state.session.role)}
      unreadCount={unreadCount}
    >
      {children}
    </AppShell>
  )
}

"use client"

import { useState, type ReactNode } from "react"

import { AppHeader } from "@/components/layout/app-header"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { WorkspaceProvider } from "@/components/providers/workspace-provider"
import type { WorkspaceSession } from "@/lib/auth/types"
import type { NavSection } from "@/lib/navigation/app-nav"
import { cn } from "@/lib/utils"

export function AppShell({
  session,
  sections,
  children,
  unreadCount = 0,
}: {
  session: WorkspaceSession
  sections: NavSection[]
  children: ReactNode
  unreadCount?: number
}) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <WorkspaceProvider session={session}>
      <div className="flex min-h-svh bg-muted/40">
        <aside
          className={cn(
            "sticky top-0 hidden h-svh shrink-0 md:block",
            collapsed ? "w-[4.5rem]" : "w-72"
          )}
        >
          <AppSidebar
            session={session}
            sections={sections}
            collapsed={collapsed}
            onToggle={() => setCollapsed((value) => !value)}
          />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <AppHeader
            session={session}
            sections={sections}
            onToggleSidebar={() => setCollapsed((value) => !value)}
            unreadCount={unreadCount}
          />
          <main className="page-main">{children}</main>
        </div>
      </div>
    </WorkspaceProvider>
  )
}

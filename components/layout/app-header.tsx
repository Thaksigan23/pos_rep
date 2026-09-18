"use client"

import { useState } from "react"
import { Bell, Menu } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppBreadcrumbs } from "@/components/layout/app-breadcrumbs"
import { UserMenu } from "@/components/layout/user-menu"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { canAccess } from "@/lib/auth/permissions"
import { ROLE_LABELS } from "@/lib/auth/labels"
import type { WorkspaceSession } from "@/lib/auth/types"
import type { NavSection } from "@/lib/navigation/app-nav"
import { APP_ROUTES } from "@/lib/navigation/paths"

export function AppHeader({
  session,
  sections,
  onToggleSidebar,
  unreadCount = 0,
}: {
  session: WorkspaceSession
  sections: NavSection[]
  onToggleSidebar: () => void
  unreadCount?: number
}) {
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur supports-backdrop-filter:bg-background/80 md:gap-3 md:px-5">
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger
          render={
            <Button variant="ghost" size="icon" className="size-9 md:hidden" />
          }
        >
          <Menu className="size-5" />
          <span className="sr-only">Open navigation</span>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 p-0" showCloseButton={false}>
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <AppSidebar
            session={session}
            sections={sections}
            onNavigate={() => setMobileOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="hidden size-9 md:inline-flex"
        onClick={onToggleSidebar}
        aria-label="Toggle sidebar"
      >
        <Menu className="size-5" aria-hidden />
      </Button>

      <div className="min-w-0 flex-1">
        {/* Mobile: shop context when sidebar is closed. Desktop: breadcrumbs only. */}
        <p className="truncate text-sm font-medium md:hidden">{session.shop.name}</p>
        <div className="hidden md:block">
          <AppBreadcrumbs />
        </div>
      </div>

      <span className="hidden rounded-md border bg-muted/50 px-2 py-1 text-xs text-muted-foreground sm:inline-flex">
        {ROLE_LABELS[session.role]}
      </span>

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="relative size-9"
              onClick={() => {
                if (canAccess(session.role, "notifications")) {
                  router.push(APP_ROUTES.notifications)
                  return
                }
                toast.info("Notifications are not available for this role.")
              }}
            />
          }
        >
          <Bell className="size-5" aria-hidden />
          {unreadCount > 0 ? (
            <span className="absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-[10px] font-semibold text-background">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
          <span className="sr-only">
            Notifications{unreadCount > 0 ? ` (${unreadCount} unread)` : ""}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {unreadCount > 0
            ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`
            : "Notifications"}
        </TooltipContent>
      </Tooltip>

      <UserMenu session={session} />
    </header>
  )
}

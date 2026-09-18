"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronLeft, type LucideIcon } from "lucide-react"

import { ShopBrandMark } from "@/components/layout/shop-brand-mark"
import { UserMenu } from "@/components/layout/user-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { WorkspaceSession } from "@/lib/auth/types"
import type { NavSection } from "@/lib/navigation/app-nav"
import { NAV_ICONS } from "@/lib/navigation/nav-icons"
import { APP_ROUTES } from "@/lib/navigation/paths"
import { cn } from "@/lib/utils"

function NavLink({
  href,
  label,
  active,
  collapsed,
  Icon,
  onNavigate,
}: {
  href: string
  label: string
  active: boolean
  collapsed: boolean
  Icon: LucideIcon
  onNavigate?: () => void
}) {
  const className = cn(
    "flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm transition",
    collapsed && "justify-center px-0",
    active
      ? collapsed
        ? "bg-sidebar-accent text-sidebar-foreground ring-1 ring-sidebar-primary font-medium"
        : "nav-active"
      : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground"
  )

  const link = (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? label : undefined}
      className={className}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      {!collapsed ? <span className="truncate">{label}</span> : null}
    </Link>
  )

  if (!collapsed) return link

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Link
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            aria-label={label}
            className={className}
          />
        }
      >
        <Icon className="size-4 shrink-0" aria-hidden />
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={10}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

export function AppSidebar({
  session,
  sections,
  collapsed,
  onToggle,
  onNavigate,
}: {
  session: WorkspaceSession
  sections: NavSection[]
  collapsed?: boolean
  onToggle?: () => void
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  const isCollapsed = Boolean(collapsed)

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div
        className={cn(
          "flex items-center gap-2.5 border-b border-sidebar-border px-3 py-3.5",
          isCollapsed && "flex-col gap-2 px-2"
        )}
      >
        <Link
          href={APP_ROUTES.dashboard}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2.5 rounded-lg",
            isCollapsed && "flex-none justify-center"
          )}
          onClick={onNavigate}
          aria-label={`${session.shop.name} — MobilePOS home`}
        >
          <ShopBrandMark
            logoUrl={session.shopSettings.logoUrl}
            alt={`${session.shop.name} logo`}
          />
          {!isCollapsed ? (
            <div className="min-w-0 flex-1 pr-1">
              <p className="truncate text-[10px] font-medium tracking-[0.14em] text-sidebar-foreground/55 uppercase">
                MobilePOS
              </p>
              <p
                className="truncate text-[13px] font-semibold leading-snug"
                title={session.shop.name}
              >
                {session.shop.name}
              </p>
            </div>
          ) : null}
        </Link>
        {onToggle ? (
          <button
            type="button"
            onClick={onToggle}
            className="hidden size-8 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/70 transition hover:bg-sidebar-accent hover:text-sidebar-foreground md:flex"
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!isCollapsed}
          >
            <ChevronLeft
              className={cn("size-4 transition", isCollapsed && "rotate-180")}
              aria-hidden
            />
          </button>
        ) : null}
      </div>

      <ScrollArea className="min-h-0 flex-1 px-2.5 py-3">
        <nav className="space-y-4" aria-label="Main">
          {sections.map((section) => (
            <div key={section.id}>
              {!isCollapsed ? (
                <p className="px-2.5 pb-1.5 text-[10px] font-medium tracking-[0.14em] text-sidebar-foreground/40 uppercase">
                  {section.label}
                </p>
              ) : (
                <span className="sr-only">{section.label}</span>
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const active =
                    item.href === "/"
                      ? pathname === "/"
                      : pathname === item.href ||
                        pathname.startsWith(`${item.href}/`)
                  const Icon = NAV_ICONS[item.icon]
                  return (
                    <NavLink
                      key={item.href}
                      href={item.href}
                      label={item.label}
                      active={active}
                      collapsed={isCollapsed}
                      Icon={Icon}
                      onNavigate={onNavigate}
                    />
                  )
                })}
              </div>
            </div>
          ))}
        </nav>
      </ScrollArea>

      <div
        className={cn(
          "border-t border-sidebar-border p-2.5",
          isCollapsed && "flex justify-center"
        )}
      >
        <UserMenu session={session} compact />
      </div>
    </div>
  )
}

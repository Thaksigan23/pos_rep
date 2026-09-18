"use client"

import { useTransition } from "react"
import { ChevronsUpDown, LogOut, Settings } from "lucide-react"

import { logoutAction } from "@/features/auth/actions"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { canAccess } from "@/lib/auth/permissions"
import { displayName, initials, ROLE_LABELS } from "@/lib/auth/labels"
import type { WorkspaceSession } from "@/lib/auth/types"
import { APP_ROUTES } from "@/lib/navigation/paths"
import { cn } from "@/lib/utils"
import { useRouter } from "next/navigation"

export function UserMenu({
  session,
  compact = false,
}: {
  session: WorkspaceSession
  compact?: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const name = displayName(
    session.profile.firstName,
    session.profile.lastName,
    session.email ?? "Staff"
  )
  const letters = initials(
    session.profile.firstName,
    session.profile.lastName,
    session.email ?? "ST"
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            className={cn(
              "h-11 gap-2 px-2 text-left",
              compact ? "w-full justify-start text-background hover:bg-background/10 hover:text-background" : ""
            )}
          />
        }
      >
        <Avatar size="sm">
          <AvatarFallback className="bg-amber-500/20 text-xs font-medium text-amber-950 dark:text-amber-100">
            {letters}
          </AvatarFallback>
        </Avatar>
        {!compact ? (
          <>
            <span className="hidden min-w-0 flex-col leading-tight lg:flex">
              <span className="truncate text-sm font-medium">{name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {ROLE_LABELS[session.role]}
              </span>
            </span>
            <ChevronsUpDown className="ml-1 hidden size-4 text-muted-foreground lg:block" />
          </>
        ) : (
          <span className="min-w-0 flex-1 text-left">
            <span className="block truncate text-sm font-medium">{name}</span>
            <span className="block truncate text-xs text-background/60">
              {ROLE_LABELS[session.role]}
            </span>
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            {session.email ?? name}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {canAccess(session.role, "settings") ? (
          <DropdownMenuItem onClick={() => router.push(APP_ROUTES.settings)}>
            <Settings />
            Settings
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          variant="destructive"
          disabled={pending}
          onClick={() => startTransition(() => logoutAction())}
        >
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

import type { Metadata } from "next"
import Link from "next/link"
import { Bell } from "lucide-react"

import { EmptyState } from "@/components/app/empty-state"
import { PageHeader } from "@/components/app/page-header"
import { buttonVariants } from "@/components/ui/button"
import {
  MarkAllReadButton,
  MarkNotificationReadButton,
} from "@/features/notifications/components/notification-actions"
import { listNotifications } from "@/features/notifications/queries"
import { requirePageAccess } from "@/lib/auth/workspace"
import { formatDisplayDateTime } from "@/lib/datetime/format"
import { NOTIFICATION_EVENT_LABELS } from "@/lib/notifications/constants"
import { repairPath, salePath, productPath } from "@/lib/navigation/feature-paths"
import { APP_ROUTES, firstSearchParam } from "@/lib/navigation/paths"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Notifications" }

function entityHref(entityType: string | null, entityId: string | null) {
  if (!entityType || !entityId) return null
  if (entityType === "repair_job" || entityType === "repair") {
    return repairPath(entityId)
  }
  if (entityType === "sale") return salePath(entityId)
  if (entityType === "product") return productPath(entityId)
  return null
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requirePageAccess("notifications")
  const params = await searchParams
  const unreadOnly = firstSearchParam(params.unread) === "1"
  const page = Math.max(1, Number(firstSearchParam(params.page) ?? "1") || 1)
  const timezone = session.shopSettings.timezone

  const { rows, total, pageSize } = await listNotifications({ unreadOnly, page })
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const hasUnread = rows.some((r) => !r.read_at)

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow={session.shop.name}
        title="Notifications"
        description="In-app alerts for repairs, stock, and warranties."
        icon={Bell}
        actions={hasUnread || unreadOnly ? <MarkAllReadButton /> : undefined}
      />

      <div className="flex flex-wrap gap-2">
        <Link
          href={APP_ROUTES.notifications}
          className={cn(
            buttonVariants({
              variant: !unreadOnly ? "default" : "outline",
              size: "sm",
            }),
            "btn-h"
          )}
        >
          All
        </Link>
        <Link
          href={`${APP_ROUTES.notifications}?unread=1`}
          className={cn(
            buttonVariants({
              variant: unreadOnly ? "default" : "outline",
              size: "sm",
            }),
            "btn-h"
          )}
        >
          Unread
        </Link>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Bell}
          title={unreadOnly ? "No unread notifications" : "No notifications"}
          description="Alerts appear here when repair and stock events fire."
        />
      ) : (
        <ul className="panel divide-y overflow-hidden">
          {rows.map((row) => {
            const href = entityHref(row.entity_type, row.entity_id)
            const unread = !row.read_at
            return (
              <li
                key={row.id}
                className={cn(
                  "flex flex-wrap items-start justify-between gap-3 px-4 py-3",
                  unread && "bg-muted/35"
                )}
              >
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    {unread ? (
                      <span
                        className="mt-1.5 size-1.5 shrink-0 rounded-full bg-sky-600"
                        aria-hidden
                      />
                    ) : (
                      <span className="mt-1.5 size-1.5 shrink-0" aria-hidden />
                    )}
                    <p
                      className={cn(
                        "text-sm",
                        unread ? "font-medium" : "font-normal text-foreground/90"
                      )}
                    >
                      {row.title}
                    </p>
                    <span className="text-xs text-muted-foreground">
                      {NOTIFICATION_EVENT_LABELS[row.event_type]}
                    </span>
                  </div>
                  {row.body ? (
                    <p className="pl-3.5 text-sm text-muted-foreground">
                      {row.body}
                    </p>
                  ) : null}
                  <p className="pl-3.5 text-xs text-muted-foreground">
                    {formatDisplayDateTime(row.created_at, timezone)}
                    {href ? (
                      <>
                        {" · "}
                        <Link
                          href={href}
                          className="underline-offset-4 hover:underline"
                        >
                          Open
                        </Link>
                      </>
                    ) : null}
                  </p>
                </div>
                {unread ? (
                  <MarkNotificationReadButton notificationId={row.id} />
                ) : null}
              </li>
            )
          })}
        </ul>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {page} of {totalPages} · {total}
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link
                href={`${APP_ROUTES.notifications}?unread=${unreadOnly ? "1" : "0"}&page=${page - 1}`}
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "btn-h"
                )}
              >
                Previous
              </Link>
            ) : null}
            {page < totalPages ? (
              <Link
                href={`${APP_ROUTES.notifications}?unread=${unreadOnly ? "1" : "0"}&page=${page + 1}`}
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "btn-h"
                )}
              >
                Next
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

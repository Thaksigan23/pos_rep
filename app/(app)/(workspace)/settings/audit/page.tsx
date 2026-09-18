import type { Metadata } from "next"
import Link from "next/link"
import { forbidden } from "next/navigation"
import { ScrollText } from "lucide-react"

import { EmptyState } from "@/components/app/empty-state"
import { PageHeader } from "@/components/app/page-header"
import { buttonVariants } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { AuditDetailsDialog } from "@/features/audit/components/audit-details-dialog"
import {
  listAuditActors,
  searchAuditLogs,
} from "@/features/audit/queries"
import { canPerform } from "@/lib/auth/permissions"
import { requirePageAccess } from "@/lib/auth/workspace"
import { formatDisplayDateTime } from "@/lib/datetime/format"
import { APP_ROUTES, firstSearchParam } from "@/lib/navigation/paths"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Audit log" }

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requirePageAccess("audit")
  if (
    !canPerform(session.role, "manageSettings") &&
    !canPerform(session.role, "viewAuditLog")
  ) {
    forbidden()
  }

  const params = await searchParams
  const from = firstSearchParam(params.from) ?? ""
  const to = firstSearchParam(params.to) ?? ""
  const actorId = firstSearchParam(params.actor) ?? ""
  const action = firstSearchParam(params.action) ?? ""
  const entity = firstSearchParam(params.entity) ?? ""
  const page = Math.max(1, Number(firstSearchParam(params.page) ?? "1") || 1)
  const timezone = session.shopSettings.timezone

  const [{ rows, total, pageSize }, actors] = await Promise.all([
    searchAuditLogs({
      organizationId: session.organization.id,
      from: from || undefined,
      to: to || undefined,
      actorId: actorId || undefined,
      action: action || undefined,
      entityType: entity || undefined,
      page,
    }),
    listAuditActors(session.organization.id),
  ])
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  function hrefFor(nextPage: number) {
    const qs = new URLSearchParams()
    if (from) qs.set("from", from)
    if (to) qs.set("to", to)
    if (actorId) qs.set("actor", actorId)
    if (action) qs.set("action", action)
    if (entity) qs.set("entity", entity)
    if (nextPage > 1) qs.set("page", String(nextPage))
    const s = qs.toString()
    return s ? `${APP_ROUTES.audit}?${s}` : APP_ROUTES.audit
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow={session.organization.name}
        title="Audit log"
        description="Settings, staff, sales, and other audited changes. Owner and admin only."
        icon={ScrollText}
        actions={
          <Link
            href={APP_ROUTES.settings}
            className={cn(buttonVariants({ variant: "outline" }), "btn-h h-10 px-4")}
          >
            Settings
          </Link>
        }
      />

      <form
        className="panel panel-pad flex flex-wrap items-end gap-2"
        method="get"
      >
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">From</span>
          <input
            type="date"
            name="from"
            defaultValue={from}
            className="control-h h-10 rounded-lg border border-input bg-background px-3 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">To</span>
          <input
            type="date"
            name="to"
            defaultValue={to}
            className="control-h h-10 rounded-lg border border-input bg-background px-3 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">Actor</span>
          <select
            name="actor"
            defaultValue={actorId}
            className="control-h h-10 rounded-lg border border-input bg-background px-3 text-sm"
          >
            <option value="">All actors</option>
            {actors.map((a) => (
              <option key={a.id} value={a.id}>
                {[a.first_name, a.last_name].filter(Boolean).join(" ") || a.id}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">Action</span>
          <input
            name="action"
            defaultValue={action}
            placeholder="Action…"
            className="control-h h-10 min-w-36 rounded-lg border border-input bg-background px-3 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">Entity</span>
          <input
            name="entity"
            defaultValue={entity}
            placeholder="Entity type…"
            className="control-h h-10 min-w-36 rounded-lg border border-input bg-background px-3 text-sm"
          />
        </label>
        <button
          type="submit"
          className={cn(buttonVariants({ variant: "outline" }), "btn-h h-10 px-4")}
        >
          Filter
        </button>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="No audit entries"
          description="Try widening the date range or clearing filters."
        />
      ) : (
        <div className="panel overflow-x-auto">
          <Table className="table-dense">
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead className="w-24">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatDisplayDateTime(row.createdAt, timezone)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {row.actorName ?? "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{row.action}</TableCell>
                  <TableCell className="text-sm">
                    <span className="font-medium">{row.entityType}</span>
                    {row.entityId ? (
                      <span className="mt-0.5 block font-mono text-[10px] text-muted-foreground">
                        {row.entityId.slice(0, 8)}…
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <AuditDetailsDialog
                      action={row.action}
                      beforeJson={row.beforeJson}
                      afterJson={row.afterJson}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages} · {total} entries
          </p>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link
                href={hrefFor(page - 1)}
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
                href={hrefFor(page + 1)}
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

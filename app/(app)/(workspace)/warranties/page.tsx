import type { Metadata } from "next"
import Link from "next/link"
import { Search, Shield } from "lucide-react"

import { EmptyState } from "@/components/app/empty-state"
import { PageHeader } from "@/components/app/page-header"
import { StatusBadge, type StatusTone } from "@/components/app/status-badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { searchWarranties } from "@/features/warranties/queries"
import { displayName } from "@/lib/auth/labels"
import { requirePageAccess } from "@/lib/auth/workspace"
import { formatDisplayDate } from "@/lib/datetime/format"
import { repairPath, warrantyPath } from "@/lib/navigation/feature-paths"
import { APP_ROUTES, firstSearchParam } from "@/lib/navigation/paths"
import {
  WARRANTY_STATUS_LABELS,
  WARRANTY_STATUS_TABS,
  type WarrantyStatus,
} from "@/lib/warranties/constants"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Warranties" }

function tone(status: WarrantyStatus): StatusTone {
  if (status === "active") return "ready"
  if (status === "claimed") return "wait"
  if (status === "expired" || status === "voided") return "stop"
  return "neutral"
}

export default async function WarrantiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requirePageAccess("warranties")
  const params = await searchParams
  const q = firstSearchParam(params.q) ?? ""
  const status = firstSearchParam(params.status) ?? "all"
  const page = Math.max(1, Number(firstSearchParam(params.page) ?? "1") || 1)
  const { timezone } = session.shopSettings

  const { rows, total, pageSize } = await searchWarranties({
    shopId: session.shop.id,
    q,
    status,
    page,
  })
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  function href(overrides: Record<string, string | undefined>) {
    const sp = new URLSearchParams()
    const merged = {
      q,
      status,
      page: String(page),
      ...overrides,
    }
    for (const [k, v] of Object.entries(merged)) {
      if (!v) continue
      if (k === "page" && v === "1") continue
      if (k === "status" && v === "all") continue
      sp.set(k, v)
    }
    const qs = sp.toString()
    return qs ? `${APP_ROUTES.warranties}?${qs}` : APP_ROUTES.warranties
  }

  function tabHref(value: string) {
    return href({ status: value, page: "1" })
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow={session.shop.name}
        title="Warranties"
        description="Warranties are created when a repair is completed. File and track claims here."
        icon={Shield}
      />

      <div className="flex flex-wrap gap-2">
        {WARRANTY_STATUS_TABS.map((tab) => (
          <Link
            key={tab.value}
            href={tabHref(tab.value)}
            className={cn(
              buttonVariants({
                variant: status === tab.value ? "default" : "outline",
                size: "sm",
              })
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      <form
        method="get"
        className="panel panel-pad flex flex-wrap items-end gap-2"
      >
        {status !== "all" ? (
          <input type="hidden" name="status" value={status} />
        ) : null}
        <div className="relative min-w-64 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            name="q"
            defaultValue={q}
            placeholder="Search ticket number…"
            className="control-h h-10 pl-9"
            aria-label="Search warranties"
          />
        </div>
        <Button type="submit" variant="outline" className="btn-h h-10 px-4">
          Search
        </Button>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon={Shield}
          title="No warranties found"
          description="Complete a repair with warranty coverage to create one automatically."
          action={{ label: "Go to repairs", href: APP_ROUTES.repairs }}
        />
      ) : (
        <div className="panel overflow-x-auto">
          <Table className="table-dense">
            <TableHeader>
              <TableRow>
                <TableHead>Warranty</TableHead>
                <TableHead>Ticket</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="hidden md:table-cell">Coverage</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs">
                    <Link
                      href={warrantyPath(row.id)}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {row.id.slice(0, 8)}…
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {row.ticket_number ? (
                      <Link
                        href={repairPath(row.repair_job_id)}
                        className="underline-offset-4 hover:underline"
                      >
                        {row.ticket_number}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    {displayName(
                      row.customer_first_name,
                      row.customer_last_name,
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {formatDisplayDate(row.start_date, timezone)} →{" "}
                    {formatDisplayDate(row.end_date, timezone)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={tone(row.status)}>
                      {WARRANTY_STATUS_LABELS[row.status]}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={warrantyPath(row.id)}
                      className={cn(
                        buttonVariants({ variant: "ghost", size: "sm" }),
                        "h-8 px-2"
                      )}
                    >
                      Open
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {page} of {totalPages} · {total} warranties
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link
                href={href({ page: String(page - 1) })}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                Previous
              </Link>
            ) : null}
            {page < totalPages ? (
              <Link
                href={href({ page: String(page + 1) })}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
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

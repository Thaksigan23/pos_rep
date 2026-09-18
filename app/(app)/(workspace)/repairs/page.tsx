import type { Metadata } from "next"
import Link from "next/link"
import { Plus, Search, Wrench } from "lucide-react"

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
import { searchRepairJobs } from "@/features/repairs/queries"
import { requirePageAccess } from "@/lib/auth/workspace"
import { formatCurrency } from "@/lib/money/currency"
import { repairNewPath, repairPath } from "@/lib/navigation/feature-paths"
import { APP_ROUTES, firstSearchParam } from "@/lib/navigation/paths"
import { displayName } from "@/lib/auth/labels"
import {
  REPAIR_PRIORITY_LABELS,
  REPAIR_STATUS_LABELS,
  REPAIR_STATUS_TABS,
  type RepairPriority,
  type RepairStatus,
} from "@/lib/repairs/constants"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Repairs" }

function statusTone(status: RepairStatus): StatusTone {
  if (status === "cancelled") return "stop"
  if (
    status === "ready_for_pickup" ||
    status === "completed" ||
    status === "delivered"
  ) {
    return "ready"
  }
  if (
    status === "waiting_for_customer_approval" ||
    status === "waiting_for_parts"
  ) {
    return "wait"
  }
  return "info"
}

function deviceLabel(row: {
  customer_devices:
    | {
        model_label: string | null
        device_models:
          | { name: string; device_brands: { name: string } | { name: string }[] | null }
          | { name: string; device_brands: { name: string } | { name: string }[] | null }[]
          | null
      }
    | {
        model_label: string | null
        device_models:
          | { name: string; device_brands: { name: string } | { name: string }[] | null }
          | { name: string; device_brands: { name: string } | { name: string }[] | null }[]
          | null
      }[]
    | null
}): string {
  const device = Array.isArray(row.customer_devices)
    ? row.customer_devices[0]
    : row.customer_devices
  if (!device) return "—"
  if (device.model_label) return device.model_label
  const model = Array.isArray(device.device_models)
    ? device.device_models[0]
    : device.device_models
  if (!model) return "—"
  const brandRaw = model.device_brands
  const brand = Array.isArray(brandRaw) ? brandRaw[0] : brandRaw
  return brand?.name ? `${brand.name} ${model.name}` : model.name
}

export default async function RepairsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requirePageAccess("repairs")
  const params = await searchParams
  const q = firstSearchParam(params.q) ?? ""
  const status = firstSearchParam(params.status) ?? "all"
  const page = Math.max(1, Number(firstSearchParam(params.page) ?? "1") || 1)
  const mineParam = firstSearchParam(params.mine)
  const mine =
    mineParam === "1" ||
    (mineParam !== "0" && session.role === "technician")

  const { rows, total, pageSize } = await searchRepairJobs({
    q,
    status,
    page,
    shopId: session.shop.id,
    technicianId: mine ? session.userId : undefined,
  })
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const { currencyCode, currencyLocale } = session.shopSettings

  function href(overrides: Record<string, string | undefined>) {
    const sp = new URLSearchParams()
    const merged = {
      q,
      status,
      mine: mine ? "1" : undefined,
      page: String(page),
      ...overrides,
    }
    for (const [k, v] of Object.entries(merged)) {
      if (!v) continue
      if (k === "status" && v === "all") continue
      if (k === "page" && v === "1") continue
      if (k === "mine" && v !== "1") continue
      sp.set(k, v)
    }
    const qs = sp.toString()
    return qs ? `${APP_ROUTES.repairs}?${qs}` : APP_ROUTES.repairs
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow={session.shop.name}
        title="Repairs"
        description="Queue, intake, and track repair jobs for this shop."
        icon={Wrench}
        actions={
          <Link
            href={repairNewPath()}
            className={cn(buttonVariants(), "btn-h h-10 px-4")}
          >
            <Plus className="size-4" />
            New repair
          </Link>
        }
      />

      <div
        className="-mx-1 overflow-x-auto px-1"
        role="navigation"
        aria-label="Repair status filters"
      >
        <div className="flex w-max gap-1.5 pb-1">
          {REPAIR_STATUS_TABS.map((tab) => (
            <Link
              key={tab.value}
              href={href({ status: tab.value, page: "1" })}
              className={cn(
                buttonVariants({
                  variant: status === tab.value ? "default" : "outline",
                  size: "sm",
                }),
                "shrink-0"
              )}
            >
              {tab.label}
            </Link>
          ))}
        </div>
      </div>

      <form
        method="get"
        className="panel panel-pad flex flex-wrap items-end gap-2"
      >
        {status !== "all" ? (
          <input type="hidden" name="status" value={status} />
        ) : null}
        {mine ? <input type="hidden" name="mine" value="1" /> : null}
        <div className="relative min-w-56 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            name="q"
            defaultValue={q}
            placeholder="Search ticket or issue…"
            className="control-h h-10 pl-9"
            aria-label="Search repairs"
          />
        </div>
        {session.role === "technician" ? (
          <select
            name="mine"
            defaultValue={mine ? "1" : "0"}
            className="control-h h-10 rounded-lg border border-input bg-background px-3 text-sm"
            aria-label="Assignment filter"
          >
            <option value="1">Assigned to me</option>
            <option value="0">All jobs</option>
          </select>
        ) : mine ? (
          <input type="hidden" name="mine" value="1" />
        ) : null}
        <Button type="submit" variant="outline" className="btn-h h-10 px-4">
          Filter
        </Button>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title="No repairs in this view"
          description="Create an intake ticket or widen your filters."
          action={{ label: "New repair", href: repairNewPath() }}
        />
      ) : (
        <div className="panel overflow-x-auto">
          <Table className="table-dense">
            <TableHeader>
              <TableRow>
                <TableHead>Repair</TableHead>
                <TableHead className="hidden md:table-cell">Issue</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden lg:table-cell">Technician</TableHead>
                <TableHead className="hidden sm:table-cell">Created</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const customer = Array.isArray(row.customers)
                  ? row.customers[0]
                  : row.customers
                const tech = Array.isArray(row.profiles)
                  ? row.profiles[0]
                  : row.profiles
                const customerName = customer
                  ? displayName(
                      customer.first_name,
                      customer.last_name,
                      "Customer"
                    )
                  : "—"
                return (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="min-w-0 space-y-0.5">
                        <Link
                          href={repairPath(row.id)}
                          className="font-mono text-sm font-semibold tracking-tight underline-offset-4 hover:underline"
                        >
                          {row.ticket_number}
                        </Link>
                        <p className="text-sm font-medium">{customerName}</p>
                        <p className="muted-xs truncate">{deviceLabel(row)}</p>
                        <p className="muted-xs truncate md:hidden">
                          {row.reported_issue}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="hidden max-w-[14rem] text-muted-foreground md:table-cell">
                      <span className="line-clamp-2 text-sm">
                        {row.reported_issue}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <StatusBadge
                          tone={statusTone(row.status as RepairStatus)}
                        >
                          {REPAIR_STATUS_LABELS[row.status as RepairStatus]}
                        </StatusBadge>
                        <span className="muted-xs">
                          {
                            REPAIR_PRIORITY_LABELS[
                              row.priority as RepairPriority
                            ]
                          }
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {tech
                        ? displayName(
                            tech.first_name,
                            tech.last_name,
                            "Technician"
                          )
                        : "Unassigned"}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">
                      <div className="space-y-0.5">
                        <p>
                          {new Date(row.created_at).toLocaleDateString()}
                        </p>
                        {row.estimated_completion_date ? (
                          <p className="muted-xs">
                            Due {row.estimated_completion_date}
                          </p>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="money-cell">
                      {formatCurrency(row.total, currencyCode, currencyLocale)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={repairPath(row.id)}
                        className={cn(
                          buttonVariants({ variant: "ghost", size: "sm" }),
                          "h-8 px-2"
                        )}
                      >
                        Open
                      </Link>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {page} of {totalPages} · {total} jobs
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link
                href={href({ page: String(page - 1) })}
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" })
                )}
              >
                Previous
              </Link>
            ) : null}
            {page < totalPages ? (
              <Link
                href={href({ page: String(page + 1) })}
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" })
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

import type { Metadata } from "next"
import Link from "next/link"
import { Plus, Search, Truck } from "lucide-react"

import { EmptyState } from "@/components/app/empty-state"
import { PageHeader } from "@/components/app/page-header"
import { StatusBadge } from "@/components/app/status-badge"
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
import { searchSuppliers } from "@/features/suppliers/queries"
import { requirePageAccess } from "@/lib/auth/workspace"
import { supplierNewPath, supplierPath } from "@/lib/navigation/feature-paths"
import { APP_ROUTES, firstSearchParam } from "@/lib/navigation/paths"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Suppliers" }

const selectClass =
  "control-h h-10 rounded-lg border border-input bg-background px-3 text-sm"

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requirePageAccess("suppliers")
  const params = await searchParams
  const q = firstSearchParam(params.q) ?? ""
  const active = (firstSearchParam(params.active) ?? "active") as
    | "all"
    | "active"
    | "inactive"
  const page = Math.max(1, Number(firstSearchParam(params.page) ?? "1") || 1)
  const { rows, total, pageSize } = await searchSuppliers({ q, page, active })
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  function href(overrides: Record<string, string | undefined>) {
    const sp = new URLSearchParams()
    const merged = {
      q,
      active,
      page: String(page),
      ...overrides,
    }
    for (const [k, v] of Object.entries(merged)) {
      if (!v) continue
      if (k === "page" && v === "1") continue
      if (k === "active" && v === "active" && !overrides.active) continue
      sp.set(k, v)
    }
    if (merged.active && merged.active !== "active") {
      sp.set("active", merged.active)
    }
    const qs = sp.toString()
    return qs ? `${APP_ROUTES.suppliers}?${qs}` : APP_ROUTES.suppliers
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Purchasing"
        title="Suppliers"
        description="Vendor contacts for purchase orders."
        icon={Truck}
        actions={
          <Link
            href={supplierNewPath()}
            className={cn(buttonVariants(), "btn-h h-10 px-4")}
          >
            <Plus className="size-4" />
            New supplier
          </Link>
        }
      />

      <form
        method="get"
        className="panel panel-pad flex flex-wrap items-end gap-2"
      >
        <div className="relative min-w-56 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            name="q"
            defaultValue={q}
            placeholder="Search suppliers…"
            className="control-h h-10 pl-9"
            aria-label="Search suppliers"
          />
        </div>
        <select
          name="active"
          defaultValue={active}
          className={selectClass}
          aria-label="Active status"
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="all">All</option>
        </select>
        <Button type="submit" variant="outline" className="btn-h h-10 px-4">
          Filter
        </Button>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="No suppliers"
          description="Add a supplier before creating purchases."
          action={{ label: "New supplier", href: supplierNewPath() }}
        />
      ) : (
        <div className="panel overflow-x-auto">
          <Table className="table-dense">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead className="hidden sm:table-cell">Phone</TableHead>
                <TableHead className="hidden md:table-cell">Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Link
                      href={supplierPath(row.id)}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {row.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.contact_person ?? "—"}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">
                    {row.phone ?? "—"}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {row.email ?? "—"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={row.is_active ? "ready" : "neutral"}>
                      {row.is_active ? "Active" : "Inactive"}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={supplierPath(row.id)}
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
            Page {page} of {totalPages} · {total} suppliers
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

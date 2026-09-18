import type { Metadata } from "next"
import Link from "next/link"
import { Plus, Search, Users } from "lucide-react"

import { EmptyState } from "@/components/app/empty-state"
import { PageHeader } from "@/components/app/page-header"
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
import { searchCustomers } from "@/features/customers/queries"
import { displayName } from "@/lib/auth/labels"
import { requirePageAccess } from "@/lib/auth/workspace"
import { customerNewPath, customerPath } from "@/lib/navigation/feature-paths"
import { APP_ROUTES, firstSearchParam } from "@/lib/navigation/paths"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Customers" }

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requirePageAccess("customers")
  const params = await searchParams
  const q = firstSearchParam(params.q) ?? ""
  const page = Math.max(1, Number(firstSearchParam(params.page) ?? "1") || 1)
  const { rows, total, pageSize } = await searchCustomers({ q, page })
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  function href(overrides: Record<string, string | undefined>) {
    const sp = new URLSearchParams()
    const merged = { q, page: String(page), ...overrides }
    for (const [k, v] of Object.entries(merged)) {
      if (!v) continue
      if (k === "page" && v === "1") continue
      sp.set(k, v)
    }
    const qs = sp.toString()
    return qs ? `${APP_ROUTES.customers}?${qs}` : APP_ROUTES.customers
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="CRM"
        title="Customers"
        description="Search customers, open profiles, and start repairs from their devices."
        icon={Users}
        actions={
          <Link
            href={customerNewPath()}
            className={cn(buttonVariants(), "btn-h h-10 px-4")}
          >
            <Plus className="size-4" />
            New customer
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
            placeholder="Search name, phone, email, number…"
            className="control-h h-10 pl-9"
            aria-label="Search customers"
          />
        </div>
        <Button type="submit" variant="outline" className="btn-h h-10 px-4">
          Filter
        </Button>
        {q ? (
          <Link
            href={APP_ROUTES.customers}
            className={cn(
              buttonVariants({ variant: "ghost" }),
              "btn-h h-10 px-4"
            )}
          >
            Clear search
          </Link>
        ) : null}
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title={q ? "No customers match this search" : "No customers yet"}
          description={
            q
              ? "Try a different search, or create a new customer."
              : "Add your first customer to start repair intake."
          }
          action={{ label: "New customer", href: customerNewPath() }}
        />
      ) : (
        <div className="panel overflow-x-auto">
          <Table className="table-dense">
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead className="hidden sm:table-cell">Email</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="min-w-0">
                      <Link
                        href={customerPath(row.id)}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {displayName(row.first_name, row.last_name, "Customer")}
                      </Link>
                      <p className="muted-xs font-mono">
                        {row.customer_number}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.phone ?? "—"}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">
                    {row.email ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={customerPath(row.id)}
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
            Page {page} of {totalPages} · {total} customers
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

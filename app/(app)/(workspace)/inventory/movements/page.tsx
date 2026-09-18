import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, History } from "lucide-react"

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
import { searchInventoryMovements } from "@/features/inventory/queries"
import { displayName } from "@/lib/auth/labels"
import { requirePageAccess } from "@/lib/auth/workspace"
import {
  MOVEMENT_TYPE_LABELS,
  type InventoryMovementType,
} from "@/lib/inventory/constants"
import { productPath } from "@/lib/navigation/feature-paths"
import { APP_ROUTES, firstSearchParam } from "@/lib/navigation/paths"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Inventory movements" }

export default async function InventoryMovementsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requirePageAccess("inventory")
  const params = await searchParams
  const productId = firstSearchParam(params.productId)
  const movementType = firstSearchParam(params.movementType)
  const fromDate = firstSearchParam(params.from)
  const toDate = firstSearchParam(params.to)
  const page = Math.max(1, Number(firstSearchParam(params.page) ?? "1") || 1)

  const { rows, total, pageSize } = await searchInventoryMovements({
    productId,
    movementType,
    fromDate,
    toDate,
    page,
  })
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="space-y-6">
      <Link
        href={APP_ROUTES.inventory}
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2 w-fit")}
      >
        <ArrowLeft className="size-4" />
        Inventory
      </Link>
      <PageHeader
        eyebrow="Ledger"
        title="Movement history"
        description="Immutable inventory movements. Owner/Admin only via RLS."
        icon={History}
      />

      <form method="get" className="flex flex-wrap gap-2">
        {productId ? (
          <input type="hidden" name="productId" value={productId} />
        ) : null}
        <select
          name="movementType"
          defaultValue={movementType ?? ""}
          className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
        >
          <option value="">All types</option>
          {(Object.keys(MOVEMENT_TYPE_LABELS) as InventoryMovementType[]).map(
            (t) => (
              <option key={t} value={t}>
                {MOVEMENT_TYPE_LABELS[t]}
              </option>
            )
          )}
        </select>
        <input
          type="date"
          name="from"
          defaultValue={fromDate ?? ""}
          className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
        />
        <input
          type="date"
          name="to"
          defaultValue={toDate ?? ""}
          className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
        />
        <button
          type="submit"
          className={cn(buttonVariants({ variant: "outline" }), "h-10 px-4")}
        >
          Filter
        </button>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon={History}
          title="No movements"
          description="Adjust stock or receive a purchase to create ledger rows."
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const product = Array.isArray(row.products)
                  ? row.products[0]
                  : row.products
                const profile = Array.isArray(row.profiles)
                  ? row.profiles[0]
                  : row.profiles
                return (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {new Date(row.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {product ? (
                        <Link
                          href={productPath(product.id)}
                          className="underline-offset-4 hover:underline"
                        >
                          {product.name}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      {MOVEMENT_TYPE_LABELS[row.movement_type as InventoryMovementType]}
                    </TableCell>
                    <TableCell
                      className={
                        Number(row.quantity_change) < 0
                          ? "text-destructive"
                          : "text-emerald-700"
                      }
                    >
                      {Number(row.quantity_change) > 0 ? "+" : ""}
                      {Number(row.quantity_change)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {row.reference_type
                        ? `${row.reference_type}${
                            row.reference_id
                              ? ` · ${row.reference_id.slice(0, 8)}`
                              : ""
                          }`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {profile
                        ? displayName(
                            profile.first_name,
                            profile.last_name,
                            "Staff"
                          )
                        : "—"}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                      {row.notes ?? "—"}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {totalPages > 1 ? (
        <p className="text-sm text-muted-foreground">
          Page {page} of {totalPages} · {total} movements
        </p>
      ) : null}
    </div>
  )
}

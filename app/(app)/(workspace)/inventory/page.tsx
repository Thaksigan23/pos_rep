import type { Metadata } from "next"
import Link from "next/link"
import { Boxes, History, Search, SlidersHorizontal } from "lucide-react"

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
import { searchInventory } from "@/features/inventory/queries"
import { ProductThumbnail } from "@/features/products/components/product-thumbnail"
import { listCatalogLookups } from "@/features/products/queries"
import { requirePageAccess } from "@/lib/auth/workspace"
import {
  PRODUCT_TYPE_LABELS,
  STOCK_STATUS_LABELS,
  type ProductType,
  type StockStatus,
} from "@/lib/inventory/constants"
import {
  inventoryMovementsPath,
  productPath,
} from "@/lib/navigation/feature-paths"
import { APP_ROUTES, firstSearchParam } from "@/lib/navigation/paths"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Inventory" }

function tone(status: string): StatusTone {
  if (status === "out_of_stock") return "stop"
  if (status === "low_stock") return "wait"
  if (status === "in_stock") return "ready"
  return "neutral"
}

const selectClass =
  "control-h h-10 rounded-lg border border-input bg-background px-3 text-sm"

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requirePageAccess("inventory")
  const params = await searchParams
  const q = firstSearchParam(params.q) ?? ""
  const categoryId = firstSearchParam(params.categoryId)
  const productType = firstSearchParam(params.productType)
  const stockStatus = firstSearchParam(params.stockStatus)
  const page = Math.max(1, Number(firstSearchParam(params.page) ?? "1") || 1)

  const [{ rows, total, pageSize }, lookups] = await Promise.all([
    searchInventory({
      shopId: session.shop.id,
      q,
      categoryId,
      productType,
      stockStatus,
      page,
    }),
    listCatalogLookups(),
  ])
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  function href(overrides: Record<string, string | undefined>) {
    const sp = new URLSearchParams()
    const merged = {
      q,
      categoryId,
      productType,
      stockStatus,
      page: String(page),
      ...overrides,
    }
    for (const [k, v] of Object.entries(merged)) {
      if (!v || (k === "page" && v === "1")) continue
      sp.set(k, v)
    }
    const qs = sp.toString()
    return qs ? `${APP_ROUTES.inventory}?${qs}` : APP_ROUTES.inventory
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow={session.shop.name}
        title="Inventory"
        description="Stock on hand for this shop. Adjustments go through the inventory ledger."
        icon={Boxes}
        actions={
          <div className="flex gap-2">
            <Link
              href={`${APP_ROUTES.inventory}/adjust`}
              className={cn(
                buttonVariants({ variant: "outline" }),
                "btn-h h-10 px-4"
              )}
            >
              <SlidersHorizontal className="size-4" />
              Adjust
            </Link>
            <Link
              href={inventoryMovementsPath()}
              className={cn(
                buttonVariants({ variant: "outline" }),
                "btn-h h-10 px-4"
              )}
            >
              <History className="size-4" />
              Movements
            </Link>
          </div>
        }
      />

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["", "All"],
            ["in_stock", "In stock"],
            ["low_stock", "Low stock"],
            ["out_of_stock", "Out of stock"],
          ] as const
        ).map(([value, label]) => (
          <Link
            key={value || "all"}
            href={href({ stockStatus: value || undefined, page: "1" })}
            className={cn(
              buttonVariants({
                variant: (stockStatus ?? "") === value ? "default" : "outline",
                size: "sm",
              })
            )}
          >
            {label}
          </Link>
        ))}
      </div>

      <form
        method="get"
        className="panel panel-pad flex flex-wrap items-end gap-2"
      >
        {stockStatus ? (
          <input type="hidden" name="stockStatus" value={stockStatus} />
        ) : null}
        <div className="relative min-w-56 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            name="q"
            defaultValue={q}
            placeholder="Search name, SKU, barcode…"
            className="control-h h-10 pl-9"
            aria-label="Search inventory"
          />
        </div>
        <select
          name="categoryId"
          defaultValue={categoryId ?? ""}
          className={selectClass}
          aria-label="Category"
        >
          <option value="">All categories</option>
          {lookups.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          name="productType"
          defaultValue={productType ?? ""}
          className={selectClass}
          aria-label="Product type"
        >
          <option value="">All types</option>
          {(Object.keys(PRODUCT_TYPE_LABELS) as ProductType[]).map((t) => (
            <option key={t} value={t}>
              {PRODUCT_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline" className="btn-h h-10 px-4">
          Filter
        </Button>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="No stock rows in this view"
          description="Try another filter, or receive a purchase to create stock."
        />
      ) : (
        <div className="panel overflow-x-auto">
          <Table className="table-dense">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40%]">Product</TableHead>
                <TableHead className="hidden sm:table-cell">SKU</TableHead>
                <TableHead className="text-right">On hand</TableHead>
                <TableHead className="hidden text-right md:table-cell">
                  Reorder
                </TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const isOut = row.stock_status === "out_of_stock"
                const isLow = row.stock_status === "low_stock"
                return (
                  <TableRow
                    key={row.product_id}
                    className={
                      isOut
                        ? "bg-destructive/[0.04]"
                        : isLow
                          ? "bg-amber-500/[0.04]"
                          : undefined
                    }
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <ProductThumbnail
                          src={
                            "primary_image_url" in row
                              ? (row.primary_image_url as string | null)
                              : null
                          }
                          alt={row.name ?? "Product"}
                          size="inventory"
                          className="rounded-md bg-neutral-50"
                        />
                        <div className="min-w-0">
                          <Link
                            href={productPath(row.product_id)}
                            className="font-medium underline-offset-4 hover:underline"
                          >
                            {row.name}
                          </Link>
                          <p className="muted-xs truncate sm:hidden">
                            {row.sku}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden font-mono text-xs text-muted-foreground sm:table-cell">
                      {row.sku}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "money-cell tabular-nums",
                        isOut && "font-semibold text-destructive",
                        isLow && "font-semibold text-amber-700 dark:text-amber-400"
                      )}
                    >
                      {Number(row.quantity)}
                    </TableCell>
                    <TableCell className="money-cell hidden text-muted-foreground md:table-cell">
                      {Number(row.reorder_level)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        tone={tone(row.stock_status ?? "not_tracked")}
                      >
                        {STOCK_STATUS_LABELS[
                          (row.stock_status as StockStatus) ?? "not_tracked"
                        ] ??
                          row.stock_status ??
                          "—"}
                      </StatusBadge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={inventoryMovementsPath({
                          productId: row.product_id,
                        })}
                        className={cn(
                          buttonVariants({ variant: "ghost", size: "sm" }),
                          "h-8 px-2"
                        )}
                      >
                        History
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
            Page {page} of {totalPages} · {total} items
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

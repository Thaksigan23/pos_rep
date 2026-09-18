import type { Metadata } from "next"
import Link from "next/link"
import { Package, Plus, Search } from "lucide-react"

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
import {
  listCatalogLookups,
  searchProducts,
} from "@/features/products/queries"
import { ProductThumbnail } from "@/features/products/components/product-thumbnail"
import { canPerform } from "@/lib/auth/permissions"
import { requirePageAccess } from "@/lib/auth/workspace"
import {
  PRODUCT_TYPE_LABELS,
  STOCK_STATUS_LABELS,
  type ProductType,
  type StockStatus,
} from "@/lib/inventory/constants"
import { formatCurrency } from "@/lib/money/currency"
import { productNewPath, productPath } from "@/lib/navigation/feature-paths"
import { APP_ROUTES, firstSearchParam } from "@/lib/navigation/paths"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Products" }

function stockTone(status: string): StatusTone {
  if (status === "out_of_stock") return "stop"
  if (status === "low_stock") return "wait"
  if (status === "in_stock") return "ready"
  return "neutral"
}

const selectClass =
  "control-h h-10 rounded-lg border border-input bg-background px-3 text-sm"

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requirePageAccess("products")
  const params = await searchParams
  const q = firstSearchParam(params.q) ?? ""
  const categoryId = firstSearchParam(params.categoryId)
  const brandId = firstSearchParam(params.brandId)
  const productType = firstSearchParam(params.productType)
  const active = (firstSearchParam(params.active) ?? "active") as
    | "all"
    | "active"
    | "inactive"
  const stockStatus = firstSearchParam(params.stockStatus)
  const page = Math.max(1, Number(firstSearchParam(params.page) ?? "1") || 1)
  const showCost = canPerform(session.role, "viewCostPrices")

  const [{ rows, total, pageSize }, lookups] = await Promise.all([
    searchProducts({
      q,
      categoryId,
      brandId,
      productType,
      active,
      stockStatus,
      shopId: session.shop.id,
      page,
      includeCosts: showCost,
      role: session.role,
    }),
    listCatalogLookups(),
  ])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const { currencyCode, currencyLocale } = session.shopSettings

  function href(overrides: Record<string, string | undefined>) {
    const sp = new URLSearchParams()
    const merged = {
      q,
      categoryId,
      brandId,
      productType,
      active,
      stockStatus,
      page: String(page),
      ...overrides,
    }
    for (const [k, v] of Object.entries(merged)) {
      if (v && v !== "all" && !(k === "active" && v === "active" && !overrides.active)) {
        if (k === "page" && v === "1") continue
        sp.set(k, v)
      }
    }
    if (merged.active && merged.active !== "active") sp.set("active", merged.active)
    const qs = sp.toString()
    return qs ? `${APP_ROUTES.products}?${qs}` : APP_ROUTES.products
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Catalog"
        title="Products"
        description="Manage SKUs, pricing, and stock-tracked items for this shop."
        icon={Package}
        actions={
          <Link
            href={productNewPath()}
            className={cn(buttonVariants(), "btn-h h-10 px-4")}
          >
            <Plus className="size-4" />
            New product
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
            placeholder="Search name, SKU, barcode…"
            className="control-h h-10 pl-9"
            aria-label="Search products"
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
          name="brandId"
          defaultValue={brandId ?? ""}
          className={selectClass}
          aria-label="Brand"
        >
          <option value="">All brands</option>
          {lookups.brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
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
        <select
          name="stockStatus"
          defaultValue={stockStatus ?? ""}
          className={selectClass}
          aria-label="Stock status"
        >
          <option value="">Any stock</option>
          <option value="in_stock">In stock</option>
          <option value="low_stock">Low stock</option>
          <option value="out_of_stock">Out of stock</option>
        </select>
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
          icon={Package}
          title="No products found"
          description="Create a product or adjust filters."
          action={{ label: "New product", href: productNewPath() }}
        />
      ) : (
        <div className="panel overflow-x-auto">
          <Table className="table-dense">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[36%]">Product</TableHead>
                <TableHead className="hidden sm:table-cell">SKU</TableHead>
                <TableHead className="hidden md:table-cell">Category</TableHead>
                <TableHead className="hidden lg:table-cell">Brand</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="text-right">Price</TableHead>
                {showCost ? (
                  <TableHead className="text-right">Cost</TableHead>
                ) : null}
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.product_id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <ProductThumbnail
                        src={
                          "primary_image_url" in row
                            ? (row.primary_image_url as string | null)
                            : null
                        }
                        alt={row.name ?? "Product"}
                        size="catalog"
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
                          {row.category_name ? ` · ${row.category_name}` : ""}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden font-mono text-xs text-muted-foreground sm:table-cell">
                    {row.sku}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {row.category_name ?? "—"}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">
                    {row.brand_name ?? "—"}
                  </TableCell>
                  <TableCell className="money-cell font-medium">
                    {row.track_inventory ? Number(row.quantity) : "—"}
                  </TableCell>
                  <TableCell className="money-cell">
                    {formatCurrency(
                      row.selling_price,
                      currencyCode,
                      currencyLocale
                    )}
                  </TableCell>
                  {showCost ? (
                    <TableCell className="money-cell text-muted-foreground">
                      {row.cost_price != null
                        ? formatCurrency(
                            row.cost_price,
                            currencyCode,
                            currencyLocale
                          )
                        : "—"}
                    </TableCell>
                  ) : null}
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusBadge
                        tone={stockTone(row.stock_status ?? "not_tracked")}
                      >
                        {STOCK_STATUS_LABELS[
                          (row.stock_status as StockStatus) ?? "not_tracked"
                        ] ??
                          row.stock_status ??
                          "—"}
                      </StatusBadge>
                      {!row.is_active ? (
                        <StatusBadge tone="neutral">Inactive</StatusBadge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={productPath(row.product_id)}
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
            Page {page} of {totalPages} · {total} products
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

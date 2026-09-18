import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Package } from "lucide-react"

import { PageHeader } from "@/components/app/page-header"
import { StatusBadge } from "@/components/app/status-badge"
import { buttonVariants } from "@/components/ui/button"
import { CompatibilityEditor } from "@/features/products/components/compatibility-editor"
import { ProductForm } from "@/features/products/components/product-form"
import { ProductImagesPanel } from "@/features/products/components/product-images-panel"
import { ProductThumbnail } from "@/features/products/components/product-thumbnail"
import {
  getProductDetail,
  listCatalogLookups,
} from "@/features/products/queries"
import { canPerform } from "@/lib/auth/permissions"
import { requirePageAccess } from "@/lib/auth/workspace"
import {
  PRODUCT_TYPE_LABELS,
  STOCK_STATUS_LABELS,
  type ProductType,
  type StockStatus,
} from "@/lib/inventory/constants"
import { formatCurrency } from "@/lib/money/currency"
import { inventoryMovementsPath } from "@/lib/navigation/feature-paths"
import { APP_ROUTES } from "@/lib/navigation/paths"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Product" }

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ productId: string }>
}) {
  const session = await requirePageAccess("products")
  const { productId } = await params
  const [detail, lookups] = await Promise.all([
    getProductDetail(productId, session.role, session.shop.id),
    listCatalogLookups(),
  ])
  if (!detail) notFound()

  const { product, cost, compatibility, deviceModels, shopInventory, stocks, images } =
    detail
  const showCost = canPerform(session.role, "viewCostPrices")
  const canManageImages =
    session.role === "owner" || session.role === "admin"
  const { currencyCode, currencyLocale } = session.shopSettings
  const selectedIds = compatibility.map((c) => c.device_model_id)
  const primary = images.find((i) => i.is_primary) ?? images[0]
  const category = Array.isArray(product.categories)
    ? product.categories[0]
    : product.categories
  const brand = Array.isArray(product.brands) ? product.brands[0] : product.brands

  return (
    <div className="page-stack">
      <Link
        href={APP_ROUTES.products}
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "-ml-2 w-fit"
        )}
      >
        <ArrowLeft className="size-4" />
        Products
      </Link>

      <section className="panel panel-pad grid gap-6 lg:grid-cols-[minmax(0,20rem)_1fr]">
        <div className="mx-auto w-full max-w-sm lg:mx-0">
          <ProductThumbnail
            src={primary?.url}
            alt={product.name}
            size="lg"
            priority
            className="aspect-square !size-full max-h-[20rem] w-full rounded-xl sm:max-h-none"
          />
        </div>

        <div className="min-w-0 space-y-4">
          <PageHeader
            eyebrow={product.sku}
            title={product.name}
            description={`${
              PRODUCT_TYPE_LABELS[product.product_type as ProductType]
            }${category?.name ? ` · ${category.name}` : ""}${
              brand?.name ? ` · ${brand.name}` : ""
            }`}
            icon={Package}
            badge={{
              label: product.is_active ? "Active" : "Inactive",
              tone: product.is_active ? "ready" : "neutral",
            }}
            actions={
              <Link
                href={inventoryMovementsPath({ productId })}
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "btn-h h-10 px-4"
                )}
              >
                Movement history
              </Link>
            }
          />

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border bg-background/60 p-3">
              <p className="text-xs text-muted-foreground">Selling price</p>
              <p className="font-heading text-xl tabular-nums">
                {formatCurrency(
                  product.selling_price,
                  currencyCode,
                  currencyLocale
                )}
              </p>
            </div>
            <div className="rounded-xl border bg-background/60 p-3">
              <p className="text-xs text-muted-foreground">
                On hand · {session.shop.name}
              </p>
              <p className="font-heading text-xl tabular-nums">
                {product.track_inventory
                  ? Number(shopInventory?.quantity ?? 0)
                  : "Not tracked"}
              </p>
            </div>
            <div className="rounded-xl border bg-background/60 p-3">
              <p className="text-xs text-muted-foreground">Stock status</p>
              <div className="mt-1">
                {shopInventory ? (
                  <StatusBadge
                    tone={
                      shopInventory.stock_status === "out_of_stock"
                        ? "stop"
                        : shopInventory.stock_status === "low_stock"
                          ? "wait"
                          : "ready"
                    }
                  >
                    {
                      STOCK_STATUS_LABELS[
                        shopInventory.stock_status as StockStatus
                      ]
                    }
                  </StatusBadge>
                ) : (
                  <span className="text-sm">—</span>
                )}
              </div>
            </div>
            <div className="rounded-xl border bg-background/60 p-3">
              <p className="text-xs text-muted-foreground">Reorder level</p>
              <p className="font-heading text-xl tabular-nums">
                {product.track_inventory
                  ? Number(shopInventory?.reorder_level ?? product.reorder_level)
                  : "—"}
              </p>
            </div>
          </div>
        </div>
      </section>

      <ProductImagesPanel
        productId={productId}
        images={images}
        canManage={canManageImages}
        productName={product.name}
      />

      {stocks.length > 1 ? (
        <section className="panel panel-pad">
          <h2 className="font-heading text-lg">Inventory by shop</h2>
          <ul className="mt-3 space-y-1 text-sm">
            {stocks.map((s) => {
              const shop = Array.isArray(s.shops) ? s.shops[0] : s.shops
              return (
                <li key={s.shop_id} className="flex justify-between">
                  <span>{shop?.name ?? s.shop_id}</span>
                  <span className="tabular-nums">{Number(s.quantity)}</span>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      <section className="panel panel-pad">
        <h2 className="mb-1 font-heading text-lg">Product information</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Pricing, tax, and catalog fields for this SKU.
          {showCost ? " Cost is visible for your role." : ""}
        </p>
        <ProductForm
          mode="edit"
          productId={productId}
          canEditCost={showCost}
          categories={lookups.categories}
          brands={lookups.brands}
          suppliers={lookups.suppliers}
          defaults={{
            name: product.name,
            sku: product.sku,
            barcode: product.barcode ?? "",
            productType: product.product_type as ProductType,
            categoryId: product.category_id ?? "",
            brandId: product.brand_id ?? "",
            supplierId: product.supplier_id ?? "",
            description: product.description ?? "",
            sellingPrice: String(product.selling_price),
            isTaxable: product.is_taxable,
            taxRateOverride:
              product.tax_rate_override != null
                ? String(product.tax_rate_override)
                : "",
            trackInventory: product.track_inventory,
            minStock: String(product.min_stock),
            reorderLevel: String(product.reorder_level),
            locationBin: product.location_bin ?? "",
            isActive: product.is_active,
            costPrice: cost ? String(cost.cost_price) : "",
          }}
        />
      </section>

      {(product.product_type === "spare_part" ||
        selectedIds.length > 0 ||
        product.product_type === "phone") && (
        <section className="panel panel-pad">
          <h2 className="mb-2 font-heading text-lg">Compatibility</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Attach one or more device models. Stored as normalized rows — not
            free text.
          </p>
          <CompatibilityEditor
            productId={productId}
            models={deviceModels as never}
            selectedIds={selectedIds}
          />
          {compatibility.length > 0 ? (
            <div className="mt-4 border-t pt-4">
              <h3 className="text-sm font-medium">Currently compatible</h3>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {compatibility.map((c) => {
                  const model = Array.isArray(c.device_models)
                    ? c.device_models[0]
                    : c.device_models
                  const brandRaw = model?.device_brands
                  const brandRow = Array.isArray(brandRaw)
                    ? brandRaw[0]
                    : brandRaw
                  return (
                    <li key={c.device_model_id}>
                      {brandRow?.name ? `${brandRow.name} · ` : ""}
                      {model?.name ?? c.device_model_id}
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : null}
        </section>
      )}
    </div>
  )
}

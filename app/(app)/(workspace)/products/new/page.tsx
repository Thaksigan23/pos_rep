import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, PackagePlus } from "lucide-react"

import { PageHeader } from "@/components/app/page-header"
import { buttonVariants } from "@/components/ui/button"
import { ProductForm } from "@/features/products/components/product-form"
import { listCatalogLookups } from "@/features/products/queries"
import { canPerform } from "@/lib/auth/permissions"
import { requirePageAccess } from "@/lib/auth/workspace"
import { APP_ROUTES } from "@/lib/navigation/paths"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "New product" }

export default async function NewProductPage() {
  const session = await requirePageAccess("products")
  const lookups = await listCatalogLookups()

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href={APP_ROUTES.products}
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2 w-fit")}
      >
        <ArrowLeft className="size-4" />
        Products
      </Link>
      <PageHeader
        eyebrow="Catalog"
        title="New product"
        description="SKU uniqueness is enforced per organization. Stock is not edited here."
        icon={PackagePlus}
      />
      <div className="rounded-2xl border bg-card p-6">
        <ProductForm
          mode="create"
          canEditCost={canPerform(session.role, "viewCostPrices")}
          categories={lookups.categories}
          brands={lookups.brands}
          suppliers={lookups.suppliers}
        />
      </div>
    </div>
  )
}

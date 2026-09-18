import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, SlidersHorizontal } from "lucide-react"

import { PageHeader } from "@/components/app/page-header"
import { buttonVariants } from "@/components/ui/button"
import { StockAdjustForm } from "@/features/inventory/components/stock-adjust-form"
import { requirePageAccess } from "@/lib/auth/workspace"
import { APP_ROUTES, firstSearchParam } from "@/lib/navigation/paths"
import { createClient } from "@/lib/supabase/server"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Stock adjustment" }

export default async function InventoryAdjustPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requirePageAccess("inventory")
  const params = await searchParams
  const productId = firstSearchParam(params.productId)

  const supabase = await createClient()
  const { data: products } = await supabase
    .from("products")
    .select("id, name, sku")
    .eq("is_active", true)
    .eq("track_inventory", true)
    .order("name")
    .limit(500)

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <Link
        href={APP_ROUTES.inventory}
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2 w-fit")}
      >
        <ArrowLeft className="size-4" />
        Inventory
      </Link>
      <PageHeader
        eyebrow="Ledger"
        title="Stock adjustment"
        description="Uses adjust_inventory. Never edits product_stocks directly."
        icon={SlidersHorizontal}
      />
      <div className="rounded-2xl border bg-card p-6">
        <StockAdjustForm
          products={products ?? []}
          shops={session.accessibleShops.map((s) => ({ id: s.id, name: s.name }))}
          defaultShopId={session.shop.id}
          defaultProductId={productId}
        />
      </div>
    </div>
  )
}

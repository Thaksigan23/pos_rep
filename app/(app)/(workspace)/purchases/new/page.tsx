import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, ClipboardPlus } from "lucide-react"

import { PageHeader } from "@/components/app/page-header"
import { buttonVariants } from "@/components/ui/button"
import { PurchaseCreateForm } from "@/features/purchases/components/purchase-create-form"
import { requirePageAccess } from "@/lib/auth/workspace"
import { APP_ROUTES } from "@/lib/navigation/paths"
import { createClient } from "@/lib/supabase/server"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "New purchase" }

export default async function NewPurchasePage() {
  const session = await requirePageAccess("purchases")
  const supabase = await createClient()
  const [{ data: suppliers }, { data: products }] = await Promise.all([
    supabase
      .from("suppliers")
      .select("id, name")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("products")
      .select("id, name, sku, barcode")
      .eq("is_active", true)
      .order("name")
      .limit(500),
  ])

  return (
    <div className="page-stack mx-auto max-w-3xl">
      <Link
        href={APP_ROUTES.purchases}
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "-ml-2 w-fit"
        )}
      >
        <ArrowLeft className="size-4" />
        Purchases
      </Link>
      <PageHeader
        eyebrow="Purchasing"
        title="New purchase"
        description="Line costs are entered by Owner/Admin. Totals are calculated by PostgreSQL."
        icon={ClipboardPlus}
      />
      <div className="panel panel-pad">
        <PurchaseCreateForm
          suppliers={suppliers ?? []}
          shops={session.accessibleShops.map((s) => ({ id: s.id, name: s.name }))}
          products={products ?? []}
          defaultShopId={session.shop.id}
          currencyCode={session.shopSettings.currencyCode}
          currencyLocale={session.shopSettings.currencyLocale}
        />
      </div>
    </div>
  )
}

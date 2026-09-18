import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Settings } from "lucide-react"

import { PageHeader } from "@/components/app/page-header"
import { SettingsForm } from "@/features/settings/components/settings-form"
import { ShopLogoPanel } from "@/features/settings/components/shop-logo-panel"
import { getShopSettingsBundle } from "@/features/settings/queries"
import { requirePageAccess } from "@/lib/auth/workspace"

export const metadata: Metadata = { title: "Settings" }

export default async function SettingsPage() {
  const session = await requirePageAccess("settings")
  const bundle = await getShopSettingsBundle(session.shop.id)
  if (!bundle) notFound()

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow={session.shop.name}
        title="Settings"
        description="Shop identity, tax, receipts, inventory, and POS controls."
        icon={Settings}
      />
      <ShopLogoPanel logoUrl={bundle.settings.logo_url} />
      <SettingsForm bundle={bundle} />
    </div>
  )
}

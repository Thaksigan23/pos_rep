import type { Metadata } from "next"

import { PageHeader } from "@/components/app/page-header"
import { DashboardView } from "@/features/dashboard/components/dashboard-view"
import { getDashboardSummary } from "@/features/dashboard/queries"
import { displayName, ROLE_LABELS } from "@/lib/auth/labels"
import { requirePageAccess } from "@/lib/auth/workspace"
import { formatDisplayDate } from "@/lib/datetime/format"

export const metadata: Metadata = {
  title: "Dashboard",
}

export default async function DashboardPage() {
  const session = await requirePageAccess("dashboard")
  const name = displayName(
    session.profile.firstName,
    session.profile.lastName,
    session.email ?? "there"
  )
  const first = name.split(" ")[0] ?? name
  const summary = await getDashboardSummary(session.shop.id)
  const localDay = formatDisplayDate(summary.local_date)

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow={session.shop.name}
        title={`Welcome back, ${first}`}
        description={`${ROLE_LABELS[session.role]} · ${localDay} · ${summary.timezone}`}
        badge={{ label: ROLE_LABELS[session.role], tone: "info" }}
      />
      <DashboardView
        summary={summary}
        role={session.role}
        currencyCode={session.shopSettings.currencyCode}
        currencyLocale={session.shopSettings.currencyLocale}
        timezone={session.shopSettings.timezone}
      />
    </div>
  )
}

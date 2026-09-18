import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Shield } from "lucide-react"

import { PageHeader } from "@/components/app/page-header"
import { StatusBadge, type StatusTone } from "@/components/app/status-badge"
import { buttonVariants } from "@/components/ui/button"
import {
  ResolveClaimForm,
  WarrantyClaimForm,
} from "@/features/warranties/components/warranty-claim-forms"
import { getWarrantyDetail } from "@/features/warranties/queries"
import { displayName } from "@/lib/auth/labels"
import { requirePageAccess } from "@/lib/auth/workspace"
import { formatDisplayDate } from "@/lib/datetime/format"
import { customerPath, repairPath } from "@/lib/navigation/feature-paths"
import { APP_ROUTES } from "@/lib/navigation/paths"
import {
  WARRANTY_CLAIM_STATUS_LABELS,
  WARRANTY_STATUS_LABELS,
  isWarrantyClaimStatus,
  type WarrantyStatus,
} from "@/lib/warranties/constants"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Warranty" }

function warrantyTone(status: WarrantyStatus): StatusTone {
  if (status === "active") return "ready"
  if (status === "claimed") return "wait"
  if (status === "expired" || status === "voided") return "stop"
  return "neutral"
}

function claimTone(status: string): StatusTone {
  if (status === "resolved" || status === "closed") return "ready"
  if (status === "rejected") return "stop"
  if (status === "in_progress") return "info"
  return "wait"
}

export default async function WarrantyDetailPage({
  params,
}: {
  params: Promise<{ warrantyId: string }>
}) {
  const session = await requirePageAccess("warranties")
  const { warrantyId } = await params
  const detail = await getWarrantyDetail(warrantyId)

  if (!detail || detail.repair?.shop_id !== session.shop.id) {
    notFound()
  }

  const { warranty, repair, claims } = detail
  const { timezone } = session.shopSettings
  const canResolve = session.role === "owner" || session.role === "admin"
  const canClaim =
    warranty.status === "active" || warranty.status === "claimed"
  const customer = repair?.customers
  const customerName = customer
    ? displayName(customer.first_name, customer.last_name, "Customer")
    : "—"

  return (
    <div className="page-stack mx-auto max-w-3xl">
      <Link
        href={APP_ROUTES.warranties}
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "-ml-2 w-fit"
        )}
      >
        <ArrowLeft className="size-4" />
        Warranties
      </Link>

      <PageHeader
        eyebrow={session.shop.name}
        title="Warranty"
        description={`${formatDisplayDate(warranty.start_date, timezone)} → ${formatDisplayDate(warranty.end_date, timezone)}`}
        icon={Shield}
        badge={{
          label: WARRANTY_STATUS_LABELS[warranty.status],
          tone: warrantyTone(warranty.status),
        }}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="panel panel-pad space-y-2 text-sm">
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Origin repair
          </h2>
          <p className="font-mono text-xs text-muted-foreground">{warranty.id}</p>
          {repair ? (
            <p>
              Ticket{" "}
              <Link
                href={repairPath(repair.id)}
                className="font-medium underline-offset-4 hover:underline"
              >
                {repair.ticket_number}
              </Link>
            </p>
          ) : (
            <p className="text-muted-foreground">No repair linked</p>
          )}
          {customer ? (
            <p>
              Customer{" "}
              <Link
                href={customerPath(customer.id)}
                className="font-medium underline-offset-4 hover:underline"
              >
                {customerName}
              </Link>
              {customer.phone ? (
                <span className="text-muted-foreground"> · {customer.phone}</span>
              ) : null}
            </p>
          ) : (
            <p className="text-muted-foreground">No customer linked</p>
          )}
        </section>

        <section className="panel panel-pad space-y-2 text-sm">
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Terms
          </h2>
          <p className="text-muted-foreground">
            {warranty.terms?.trim() || "No terms recorded."}
          </p>
        </section>
      </div>

      <section className="panel panel-pad space-y-4">
        <h2 className="font-heading text-lg">Claims</h2>
        {claims.length === 0 ? (
          <p className="text-sm text-muted-foreground">No claims yet.</p>
        ) : (
          <ul className="space-y-4">
            {claims.map((claim) => (
              <li key={claim.id} className="rounded-xl border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">
                      {formatDisplayDate(claim.claim_date, timezone)}
                    </p>
                    <p className="mt-1 text-sm">{claim.description}</p>
                    {claim.resolution ? (
                      <p className="mt-2 text-sm text-muted-foreground">
                        Resolution: {claim.resolution}
                      </p>
                    ) : null}
                  </div>
                  <StatusBadge tone={claimTone(claim.status)}>
                    {isWarrantyClaimStatus(claim.status)
                      ? WARRANTY_CLAIM_STATUS_LABELS[claim.status]
                      : claim.status}
                  </StatusBadge>
                </div>
                {canResolve ? (
                  <ResolveClaimForm claim={claim} warrantyId={warranty.id} />
                ) : null}
              </li>
            ))}
          </ul>
        )}

        <WarrantyClaimForm warrantyId={warranty.id} canClaim={canClaim} />
      </section>
    </div>
  )
}

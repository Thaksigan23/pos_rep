import type { Metadata } from "next"
import Link from "next/link"
import { CreditCard } from "lucide-react"

import { EmptyState } from "@/components/app/empty-state"
import { PageHeader } from "@/components/app/page-header"
import { buttonVariants } from "@/components/ui/button"
import { requirePageAccess } from "@/lib/auth/workspace"
import { APP_ROUTES } from "@/lib/navigation/paths"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Payments" }

/**
 * Standalone payments browser is deferred. Receipts/refunds live on sale
 * and repair documents. This route remains for PAGE_ACCESS / deep links.
 */
export default async function PaymentsPage() {
  await requirePageAccess("payments")

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Finance"
        title="Payments"
        description="Payment history is recorded on each sale and repair. A dedicated ledger browser is not available yet."
        icon={CreditCard}
        badge={{ label: "Deferred", tone: "wait" }}
      />
      <EmptyState
        icon={CreditCard}
        title="Use sale and repair documents"
        description="Open a completed sale or repair to view receipts, voids, and refunds. This screen will not invent a separate payments subsystem."
        action={{ label: "View sales", href: APP_ROUTES.sales }}
      />
      <p className="muted-sm text-center">
        Need repairs instead?{" "}
        <Link
          href={APP_ROUTES.repairs}
          className={cn(buttonVariants({ variant: "link" }), "h-auto px-0")}
        >
          Open repairs
        </Link>
      </p>
    </div>
  )
}

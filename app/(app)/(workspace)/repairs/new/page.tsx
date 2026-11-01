import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, ClipboardPlus } from "lucide-react"
import { forbidden } from "next/navigation"

import { PageHeader } from "@/components/app/page-header"
import { buttonVariants } from "@/components/ui/button"
import { RepairAcceptForm } from "@/features/repairs/components/repair-accept-form"
import { canPerform } from "@/lib/auth/permissions"
import { requirePageAccess } from "@/lib/auth/workspace"
import { APP_ROUTES } from "@/lib/navigation/paths"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Accept repair" }

export default async function NewRepairPage() {
  const session = await requirePageAccess("repairs")
  if (!canPerform(session.role, "intakeRepairs")) forbidden()

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href={APP_ROUTES.repairs}
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "-ml-2 w-fit"
        )}
      >
        <ArrowLeft className="size-4" />
        Repairs
      </Link>
      <PageHeader
        eyebrow="Intake"
        title="Accept repair"
        description="Name, phone, device, problem, and the agreed price. The customer is saved with the job. Print the receipt and phone sticker next."
        icon={ClipboardPlus}
      />
      <div className="rounded-2xl border bg-card p-6">
        <RepairAcceptForm currencyCode={session.shopSettings.currencyCode} />
      </div>
    </div>
  )
}

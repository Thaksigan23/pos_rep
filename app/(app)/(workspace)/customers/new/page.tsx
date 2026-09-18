import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, UserPlus } from "lucide-react"

import { PageHeader } from "@/components/app/page-header"
import { buttonVariants } from "@/components/ui/button"
import { CustomerForm } from "@/features/customers/components/customer-form"
import { requirePageAccess } from "@/lib/auth/workspace"
import { APP_ROUTES } from "@/lib/navigation/paths"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "New customer" }

export default async function NewCustomerPage() {
  await requirePageAccess("customers")

  return (
    <div className="page-stack mx-auto max-w-2xl">
      <Link
        href={APP_ROUTES.customers}
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "-ml-2 w-fit"
        )}
      >
        <ArrowLeft className="size-4" />
        Customers
      </Link>
      <PageHeader
        eyebrow="CRM"
        title="New customer"
        description="Create a customer profile before attaching devices or opening a repair."
        icon={UserPlus}
      />
      <div className="panel panel-pad">
        <CustomerForm mode="create" />
      </div>
    </div>
  )
}

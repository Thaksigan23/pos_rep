import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Truck } from "lucide-react"

import { PageHeader } from "@/components/app/page-header"
import { buttonVariants } from "@/components/ui/button"
import { SupplierForm } from "@/features/suppliers/components/supplier-form"
import { requirePageAccess } from "@/lib/auth/workspace"
import { APP_ROUTES } from "@/lib/navigation/paths"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "New supplier" }

export default async function NewSupplierPage() {
  await requirePageAccess("suppliers")
  return (
    <div className="page-stack mx-auto max-w-xl">
      <Link
        href={APP_ROUTES.suppliers}
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "-ml-2 w-fit"
        )}
      >
        <ArrowLeft className="size-4" />
        Suppliers
      </Link>
      <PageHeader eyebrow="Purchasing" title="New supplier" icon={Truck} />
      <div className="panel panel-pad">
        <SupplierForm mode="create" />
      </div>
    </div>
  )
}

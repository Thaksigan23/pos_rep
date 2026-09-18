import type { Metadata } from "next"
import Link from "next/link"
import { Users } from "lucide-react"

import { PageHeader } from "@/components/app/page-header"
import { buttonVariants } from "@/components/ui/button"
import { StaffCreateForm } from "@/features/users/components/staff-create-form"
import { listOrgShops } from "@/features/users/queries"
import { requirePageAccess } from "@/lib/auth/workspace"
import { APP_ROUTES } from "@/lib/navigation/paths"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "New staff" }

export default async function NewUserPage() {
  const session = await requirePageAccess("users")
  const shops = await listOrgShops(session.organization.id)

  return (
    <div className="page-stack mx-auto max-w-xl">
      <PageHeader
        eyebrow={session.organization.name}
        title="New staff"
        description="Creates a login and assigns an org role. Owner cannot be created here."
        icon={Users}
        actions={
          <Link
            href={APP_ROUTES.users}
            className={cn(buttonVariants({ variant: "outline" }), "btn-h h-10 px-4")}
          >
            Back
          </Link>
        }
      />
      <div className="panel panel-pad">
        <StaffCreateForm shops={shops} />
      </div>
    </div>
  )
}

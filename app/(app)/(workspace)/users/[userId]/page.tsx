import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Users } from "lucide-react"

import { PageHeader } from "@/components/app/page-header"
import { buttonVariants } from "@/components/ui/button"
import { StaffEditForm } from "@/features/users/components/staff-edit-form"
import { getStaffMember, listOrgShops } from "@/features/users/queries"
import { requirePageAccess } from "@/lib/auth/workspace"
import { APP_ROUTES } from "@/lib/navigation/paths"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Staff" }

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>
}) {
  const session = await requirePageAccess("users")
  const { userId } = await params
  const [staff, shops] = await Promise.all([
    getStaffMember(session, userId),
    listOrgShops(session.organization.id),
  ])
  if (!staff) notFound()

  const name =
    [staff.firstName, staff.lastName].filter(Boolean).join(" ") || "Staff"

  return (
    <div className="page-stack mx-auto max-w-xl">
      <PageHeader
        eyebrow={session.organization.name}
        title={name}
        description="Update role, activity, and shop memberships."
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
      <StaffEditForm
        staff={staff}
        shops={shops}
        currentUserId={session.userId}
      />
    </div>
  )
}

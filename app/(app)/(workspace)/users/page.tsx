import type { Metadata } from "next"
import Link from "next/link"
import { Plus, Users } from "lucide-react"

import { EmptyState } from "@/components/app/empty-state"
import { PageHeader } from "@/components/app/page-header"
import { StatusBadge, type StatusTone } from "@/components/app/status-badge"
import { buttonVariants } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { listStaff } from "@/features/users/queries"
import { ROLE_LABELS } from "@/lib/auth/labels"
import type { AppRole } from "@/lib/auth/roles"
import { requirePageAccess } from "@/lib/auth/workspace"
import { userNewPath, userPath } from "@/lib/navigation/feature-paths"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Users" }

function roleTone(role: string): StatusTone {
  if (role === "owner") return "info"
  if (role === "admin") return "info"
  if (role === "technician") return "wait"
  return "neutral"
}

export default async function UsersPage() {
  const session = await requirePageAccess("users")
  const staff = await listStaff(session)

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow={session.organization.name}
        title="Users"
        description="Staff accounts, roles, and shop access. Owner and admin only."
        icon={Users}
        actions={
          <Link
            href={userNewPath()}
            className={cn(buttonVariants(), "btn-h h-10 px-4")}
          >
            <Plus className="size-4" />
            New staff
          </Link>
        }
      />

      {staff.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No staff yet"
          description="Create a cashier or technician account to start."
          action={{ label: "New staff", href: userNewPath() }}
        />
      ) : (
        <div className="panel overflow-x-auto">
          <Table className="table-dense">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Shops</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {staff.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Link
                      href={userPath(row.id)}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {[row.firstName, row.lastName].filter(Boolean).join(" ") ||
                        "Unnamed"}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.email ?? "—"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={roleTone(row.role)}>
                      {ROLE_LABELS[row.role as AppRole] ?? row.role}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className="max-w-48 truncate text-sm text-muted-foreground">
                    {row.role === "owner" || row.role === "admin"
                      ? "All shops"
                      : row.shopNames.join(", ") || "—"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={row.isActive ? "ready" : "neutral"}>
                      {row.isActive ? "Active" : "Inactive"}
                    </StatusBadge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

import { EmptyState } from "@/components/app/empty-state"
import { PageHeader } from "@/components/app/page-header"
import type { AppPage } from "@/lib/auth/permissions"
import { NAV_SECTIONS } from "@/lib/navigation/app-nav"
import { NAV_ICONS } from "@/lib/navigation/nav-icons"

const COPY: Record<
  AppPage,
  { eyebrow: string; emptyTitle: string; emptyDescription: string }
> = {
  dashboard: {
    eyebrow: "Overview",
    emptyTitle: "The floor is quiet",
    emptyDescription:
      "Today's sales, open repairs, and low stock will land here once operations go live.",
  },
  pos: {
    eyebrow: "Operations",
    emptyTitle: "Register is ready",
    emptyDescription:
      "Open POS from navigation to scan, ring up, and take payment.",
  },
  sales: {
    eyebrow: "Operations",
    emptyTitle: "No sales yet",
    emptyDescription:
      "Completed tickets, holds, and refunds will appear in this list.",
  },
  repairs: {
    eyebrow: "Operations",
    emptyTitle: "No repair tickets yet",
    emptyDescription:
      "Intake, diagnosis, estimates, and pickup will be managed from this queue.",
  },
  customers: {
    eyebrow: "Operations",
    emptyTitle: "Customer book is empty",
    emptyDescription:
      "Walk-ins, phone numbers, and linked devices will appear here.",
  },
  products: {
    eyebrow: "Inventory",
    emptyTitle: "Catalog is waiting",
    emptyDescription:
      "Spare parts, accessories, and selling prices will be managed here.",
  },
  inventory: {
    eyebrow: "Inventory",
    emptyTitle: "No stock movements yet",
    emptyDescription:
      "On-hand quantities stay on the ledger. Counts and adjustments will open here.",
  },
  purchases: {
    eyebrow: "Inventory",
    emptyTitle: "No purchase orders",
    emptyDescription:
      "Supplier receiving will post through the inventory ledger from this screen.",
  },
  suppliers: {
    eyebrow: "Inventory",
    emptyTitle: "No suppliers yet",
    emptyDescription: "Vendor contacts for parts purchasing will live here.",
  },
  expenses: {
    eyebrow: "Finance",
    emptyTitle: "No expenses recorded",
    emptyDescription: "Shop running costs will be entered here by owners and admins.",
  },
  payments: {
    eyebrow: "Finance",
    emptyTitle: "No payments to review",
    emptyDescription:
      "Receipts, voids, and refunds will stay on the payment ledger. Overpayment is never silent.",
  },
  warranties: {
    eyebrow: "After sales",
    emptyTitle: "No warranties on file",
    emptyDescription: "Repair warranties and claims will surface here after jobs complete.",
  },
  reports: {
    eyebrow: "Insights",
    emptyTitle: "Reports are not live yet",
    emptyDescription: "Sales, repairs, and inventory reports will be added after the operations screens.",
  },
  notifications: {
    eyebrow: "System",
    emptyTitle: "Inbox is clear",
    emptyDescription: "Repair and stock alerts will appear here when those workflows are connected.",
  },
  users: {
    eyebrow: "System",
    emptyTitle: "Staff directory",
    emptyDescription: "Invite and assign cashiers, technicians, and admins without letting anyone change their own role.",
  },
  settings: {
    eyebrow: "System",
    emptyTitle: "Shop settings",
    emptyDescription: "Tax, prefixes, timezone, and receipt footer will be edited here.",
  },
  audit: {
    eyebrow: "System",
    emptyTitle: "Audit log",
    emptyDescription: "Settings and staff change history for owners and admins.",
  },
}

export function ModulePlaceholder({ page }: { page: AppPage }) {
  const item = NAV_SECTIONS.flatMap((section) => section.items).find(
    (entry) => entry.page === page
  )
  const copy = COPY[page]
  const Icon = item ? NAV_ICONS[item.icon] : undefined

  if (!item || !Icon) {
    return null
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={copy.eyebrow}
        title={item.label}
        description={item.description}
        icon={Icon}
        badge={{ label: "Coming next", tone: "wait" }}
      />
      <EmptyState
        icon={Icon}
        title={copy.emptyTitle}
        description={copy.emptyDescription}
      />
    </div>
  )
}

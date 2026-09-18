import { canAccess, type AppPage } from "@/lib/auth/permissions"
import type { AppRole } from "@/lib/auth/roles"
import type { NavIconName } from "@/lib/navigation/nav-icons"
import { APP_ROUTES } from "@/lib/navigation/paths"

export type NavSectionId =
  | "workspace"
  | "catalog"
  | "finance"
  | "operations"
  | "admin"

export type NavItem = {
  href: string
  label: string
  page: AppPage
  icon: NavIconName
  description: string
}

export type NavSection = {
  id: NavSectionId
  label: string
  items: NavItem[]
}

export const NAV_SECTIONS: NavSection[] = [
  {
    id: "workspace",
    label: "Workspace",
    items: [
      {
        href: APP_ROUTES.dashboard,
        label: "Dashboard",
        page: "dashboard",
        icon: "dashboard",
        description: "Today at the counter",
      },
      {
        href: APP_ROUTES.pos,
        label: "POS",
        page: "pos",
        icon: "pos",
        description: "Checkout and tickets",
      },
      {
        href: APP_ROUTES.repairs,
        label: "Repairs",
        page: "repairs",
        icon: "repairs",
        description: "Repair jobs and estimates",
      },
      {
        href: APP_ROUTES.customers,
        label: "Customers",
        page: "customers",
        icon: "customers",
        description: "Customers and devices",
      },
    ],
  },
  {
    id: "catalog",
    label: "Catalog",
    items: [
      {
        href: APP_ROUTES.products,
        label: "Products",
        page: "products",
        icon: "products",
        description: "Catalog and spare parts",
      },
      {
        href: APP_ROUTES.inventory,
        label: "Inventory",
        page: "inventory",
        icon: "inventory",
        description: "Stock on hand",
      },
      {
        href: APP_ROUTES.purchases,
        label: "Purchases",
        page: "purchases",
        icon: "purchases",
        description: "Purchase orders",
      },
      {
        href: APP_ROUTES.suppliers,
        label: "Suppliers",
        page: "suppliers",
        icon: "suppliers",
        description: "Vendors",
      },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    items: [
      {
        href: APP_ROUTES.sales,
        label: "Sales",
        page: "sales",
        icon: "sales",
        description: "Receipts and held sales",
      },
      {
        href: APP_ROUTES.expenses,
        label: "Expenses",
        page: "expenses",
        icon: "expenses",
        description: "Shop expenses",
      },
      {
        href: APP_ROUTES.reports,
        label: "Reports",
        page: "reports",
        icon: "reports",
        description: "Sales and repair reports",
      },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    items: [
      {
        href: APP_ROUTES.warranties,
        label: "Warranties",
        page: "warranties",
        icon: "warranties",
        description: "Warranty jobs and claims",
      },
      {
        href: APP_ROUTES.notifications,
        label: "Notifications",
        page: "notifications",
        icon: "notifications",
        description: "Alerts and messages",
      },
    ],
  },
  {
    id: "admin",
    label: "Admin",
    items: [
      {
        href: APP_ROUTES.users,
        label: "Staff",
        page: "users",
        icon: "users",
        description: "Staff and roles",
      },
      {
        href: APP_ROUTES.settings,
        label: "Settings",
        page: "settings",
        icon: "settings",
        description: "Shop and tax settings",
      },
    ],
  },
]

export function navigationForRole(role: AppRole): NavSection[] {
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => canAccess(role, item.page)),
  })).filter((section) => section.items.length > 0)
}

export function navItemByPath(pathname: string): NavItem | undefined {
  const normalized = pathname === "" ? "/" : pathname
  const items = NAV_SECTIONS.flatMap((section) => section.items)
  const matches = items.filter((item) =>
    item.href === "/"
      ? normalized === "/"
      : normalized === item.href || normalized.startsWith(`${item.href}/`)
  )
  if (matches.length === 0) return undefined
  return matches.sort((a, b) => b.href.length - a.href.length)[0]
}

export function breadcrumbsForPath(pathname: string): { href: string; label: string }[] {
  const item = navItemByPath(pathname)
  const crumbs: { href: string; label: string }[] = [
    { href: APP_ROUTES.dashboard, label: "Home" },
  ]

  if (!item || item.href === APP_ROUTES.dashboard) {
    return crumbs
  }

  const section = NAV_SECTIONS.find((group) =>
    group.items.some((entry) => entry.href === item.href)
  )
  if (section && section.id !== "workspace") {
    crumbs.push({ href: item.href, label: section.label })
  }
  crumbs.push({ href: item.href, label: item.label })
  return crumbs
}

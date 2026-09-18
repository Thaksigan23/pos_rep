import {
  Banknote,
  BarChart3,
  Bell,
  ClipboardList,
  CreditCard,
  FileText,
  LayoutDashboard,
  Package,
  Receipt,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Truck,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react"

export type NavIconName =
  | "dashboard"
  | "pos"
  | "sales"
  | "repairs"
  | "customers"
  | "products"
  | "inventory"
  | "purchases"
  | "suppliers"
  | "expenses"
  | "payments"
  | "warranties"
  | "reports"
  | "notifications"
  | "users"
  | "settings"

export const NAV_ICONS: Record<NavIconName, LucideIcon> = {
  dashboard: LayoutDashboard,
  pos: ShoppingBag,
  sales: FileText,
  repairs: Wrench,
  customers: Users,
  products: Package,
  inventory: ClipboardList,
  purchases: Receipt,
  suppliers: Truck,
  expenses: CreditCard,
  payments: Banknote,
  warranties: ShieldCheck,
  reports: BarChart3,
  notifications: Bell,
  users: Users,
  settings: Settings,
}

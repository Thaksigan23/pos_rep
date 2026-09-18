import type { AppRole } from "@/lib/auth/roles"

export const PERMISSIONS = {
  manageSettings: ["owner", "admin"],
  manageUsers: ["owner", "admin"],
  viewCostPrices: ["owner", "admin"],
  adjustInventory: ["owner", "admin"],
  managePurchases: ["owner", "admin"],
  operatePos: ["owner", "admin", "cashier"],
  manageCustomers: ["owner", "admin", "cashier"],
  intakeRepairs: ["owner", "admin", "cashier", "technician"],
  diagnoseRepairs: ["owner", "admin", "technician"],
  consumeRepairParts: ["owner", "admin", "technician"],
  takePayments: ["owner", "admin", "cashier"],
  sendEstimates: ["owner", "admin", "cashier"],
  exceptionalRepairCancel: ["owner", "admin"],
  refundSales: ["owner", "admin"],
  manageExpenses: ["owner", "admin"],
  viewFullReports: ["owner", "admin"],
  viewAuditLog: ["owner", "admin"],
} as const satisfies Record<string, readonly AppRole[]>

export type Permission = keyof typeof PERMISSIONS

export const PAGE_ACCESS = {
  dashboard: ["owner", "admin", "cashier", "technician"],
  pos: PERMISSIONS.operatePos,
  sales: PERMISSIONS.operatePos,
  repairs: PERMISSIONS.intakeRepairs,
  customers: PERMISSIONS.manageCustomers,
  products: ["owner", "admin"],
  inventory: PERMISSIONS.adjustInventory,
  purchases: PERMISSIONS.managePurchases,
  suppliers: PERMISSIONS.managePurchases,
  expenses: PERMISSIONS.manageExpenses,
  payments: PERMISSIONS.takePayments,
  warranties: ["owner", "admin", "cashier", "technician"],
  reports: PERMISSIONS.viewFullReports,
  notifications: ["owner", "admin", "cashier", "technician"],
  users: PERMISSIONS.manageUsers,
  settings: PERMISSIONS.manageSettings,
  audit: PERMISSIONS.viewAuditLog,
} as const satisfies Record<string, readonly AppRole[]>

export type AppPage = keyof typeof PAGE_ACCESS

export function can(role: AppRole, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly AppRole[]).includes(role)
}

export function canPerform(role: AppRole, permission: Permission): boolean {
  return can(role, permission)
}

export function canAccess(role: AppRole, page: AppPage): boolean {
  return (PAGE_ACCESS[page] as readonly AppRole[]).includes(role)
}

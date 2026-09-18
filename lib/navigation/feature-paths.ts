import { APP_ROUTES } from "@/lib/navigation/paths"

export function customerPath(customerId: string) {
  return `${APP_ROUTES.customers}/${customerId}`
}

export function customerNewPath() {
  return `${APP_ROUTES.customers}/new`
}

export function repairPath(repairId: string) {
  return `${APP_ROUTES.repairs}/${repairId}`
}

export function repairNewPath(params?: { customerId?: string; deviceId?: string }) {
  const search = new URLSearchParams()
  if (params?.customerId) search.set("customerId", params.customerId)
  if (params?.deviceId) search.set("deviceId", params.deviceId)
  const qs = search.toString()
  return qs ? `${APP_ROUTES.repairs}/new?${qs}` : `${APP_ROUTES.repairs}/new`
}

export function productPath(productId: string) {
  return `${APP_ROUTES.products}/${productId}`
}

export function productNewPath() {
  return `${APP_ROUTES.products}/new`
}

export function supplierPath(supplierId: string) {
  return `${APP_ROUTES.suppliers}/${supplierId}`
}

export function supplierNewPath() {
  return `${APP_ROUTES.suppliers}/new`
}

export function purchasePath(purchaseId: string) {
  return `${APP_ROUTES.purchases}/${purchaseId}`
}

export function purchaseNewPath() {
  return `${APP_ROUTES.purchases}/new`
}

export function inventoryMovementsPath(params?: { productId?: string }) {
  const search = new URLSearchParams()
  if (params?.productId) search.set("productId", params.productId)
  const qs = search.toString()
  return qs
    ? `${APP_ROUTES.inventory}/movements?${qs}`
    : `${APP_ROUTES.inventory}/movements`
}

export function salePath(saleId: string) {
  return `${APP_ROUTES.sales}/${saleId}`
}

export function saleReceiptPath(saleId: string) {
  return `${APP_ROUTES.sales}/${saleId}/receipt`
}

export function saleRefundPath(saleId: string) {
  return `${APP_ROUTES.sales}/${saleId}/refund`
}

export function expensePath(expenseId: string) {
  return `${APP_ROUTES.expenses}/${expenseId}`
}

export function expenseNewPath() {
  return `${APP_ROUTES.expenses}/new`
}

export function warrantyPath(warrantyId: string) {
  return `${APP_ROUTES.warranties}/${warrantyId}`
}

export function userPath(userId: string) {
  return `${APP_ROUTES.users}/${userId}`
}

export function userNewPath() {
  return `${APP_ROUTES.users}/new`
}

export function auditPath() {
  return APP_ROUTES.audit
}

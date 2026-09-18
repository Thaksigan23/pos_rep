import type { Database } from "@/types/database"

export type ProductType = Database["public"]["Enums"]["product_type"]
export type InventoryMovementType =
  Database["public"]["Enums"]["inventory_movement_type"]
export type PurchaseStatus = Database["public"]["Enums"]["purchase_status"]

export type StockStatus =
  | "in_stock"
  | "low_stock"
  | "out_of_stock"
  | "not_tracked"

export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  phone: "Phone",
  accessory: "Accessory",
  spare_part: "Spare part",
  other: "Other",
  service: "Service",
}

export const STOCK_STATUS_LABELS: Record<StockStatus, string> = {
  in_stock: "In stock",
  low_stock: "Low stock",
  out_of_stock: "Out of stock",
  not_tracked: "Not tracked",
}

export const PURCHASE_STATUS_LABELS: Record<PurchaseStatus, string> = {
  draft: "Draft",
  ordered: "Ordered",
  partially_received: "Partially received",
  received: "Received",
  cancelled: "Cancelled",
}

export const ADJUSTMENT_MOVEMENT_TYPES = [
  "adjustment",
  "damaged",
  "stock_count",
  "stock_count_correction",
] as const satisfies readonly InventoryMovementType[]

export const MOVEMENT_TYPE_LABELS: Record<InventoryMovementType, string> = {
  purchase: "Purchase",
  sale: "Sale",
  sale_return: "Sale return",
  customer_return: "Customer return",
  repair_usage: "Repair usage",
  repair_return: "Repair return",
  return_to_supplier: "Return to supplier",
  adjustment: "Adjustment",
  damaged: "Damaged",
  stock_count: "Stock count",
  stock_count_correction: "Stock count correction",
}

export function isProductType(value: string): value is ProductType {
  return Object.prototype.hasOwnProperty.call(PRODUCT_TYPE_LABELS, value)
}

export function isStockStatus(value: string): value is StockStatus {
  return Object.prototype.hasOwnProperty.call(STOCK_STATUS_LABELS, value)
}

export function defaultTrackInventory(type: ProductType): boolean {
  return type !== "service"
}

import type { Database } from "@/types/database"
import {
  PAYMENT_METHOD_LABELS as REPAIR_PAYMENT_METHOD_LABELS,
  type PaymentMethod,
} from "@/lib/repairs/constants"

export type SaleStatus = Database["public"]["Enums"]["sale_status"]
export type { PaymentMethod }

export const SALE_STATUS_LABELS: Record<SaleStatus, string> = {
  held: "Held",
  completed: "Completed",
  cancelled: "Cancelled",
  refunded: "Refunded",
  partially_refunded: "Partially refunded",
}

export const SALE_STATUS_TABS: { value: SaleStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "held", label: "Held" },
  { value: "completed", label: "Completed" },
  { value: "partially_refunded", label: "Partial refund" },
  { value: "refunded", label: "Refunded" },
  { value: "cancelled", label: "Cancelled" },
]

export const PAYMENT_METHOD_LABELS = REPAIR_PAYMENT_METHOD_LABELS

export function isSaleStatus(value: string): value is SaleStatus {
  return Object.prototype.hasOwnProperty.call(SALE_STATUS_LABELS, value)
}

export function mapSaleRpcError(message: string): string {
  const lower = message.toLowerCase()

  if (lower.includes("insufficient stock")) {
    return "Not enough stock for one or more items."
  }
  if (lower.includes("unknown product") || lower.includes("product not found")) {
    return "A product in the cart is missing or inactive."
  }
  if (lower.includes("inactive")) {
    return "One or more products are inactive and cannot be sold."
  }
  if (lower.includes("invalid quantity") || lower.includes("invalid refund quantity")) {
    return "Check the quantity entered."
  }
  if (lower.includes("discount exceeds cashier maximum")) {
    return "Discount exceeds cashier maximum."
  }
  if (
    lower.includes("invalid discount") ||
    lower.includes("discount cannot create a negative")
  ) {
    return "Discount is invalid for this line."
  }
  if (lower.includes("insufficient role for discounts")) {
    return "Your role cannot apply line discounts."
  }
  if (
    lower.includes("payment exceeds") ||
    lower.includes("exceeds outstanding")
  ) {
    return "Payment amount exceeds the amount due."
  }
  if (lower.includes("cash tendered is insufficient") || lower.includes("tendered")) {
    if (lower.includes("insufficient") || lower.includes("less than")) {
      return "Cash tendered is less than the amount due."
    }
  }
  if (lower.includes("sale is not fully paid")) {
    return "Payment does not cover the sale total."
  }
  if (lower.includes("duplicate") || lower.includes("unique")) {
    return "This sale was already recorded (duplicate request)."
  }
  if (
    lower.includes("already completed") ||
    lower.includes("only held sales can be completed")
  ) {
    return "This held sale was already completed or is no longer held."
  }
  if (lower.includes("already refunded") || lower.includes("cannot be refunded")) {
    return "This sale cannot be refunded."
  }
  if (lower.includes("already voided") || lower.includes("payment already voided")) {
    return "This payment was already voided."
  }
  if (lower.includes("already closed")) {
    return "This sale is already closed."
  }
  if (
    lower.includes("unauthorized") ||
    lower.includes("insufficient role") ||
    lower.includes("shop access denied") ||
    lower.includes("42501")
  ) {
    return "You are not allowed to perform this action."
  }
  if (lower.includes("sale not found")) {
    return "Sale not found."
  }
  if (lower.includes("cancellation reason")) {
    return "A cancellation reason is required."
  }
  if (lower.includes("refund reason")) {
    return "A refund reason is required."
  }
  if (lower.includes("void reason")) {
    return "A void reason is required."
  }
  if (lower.includes("refund exceeds")) {
    return "Refund would exceed the sale total."
  }
  if (lower.includes("invalid payment amount") || lower.includes("invalid tendered")) {
    return "Enter a valid payment amount."
  }

  return message || "Something went wrong with this sale."
}

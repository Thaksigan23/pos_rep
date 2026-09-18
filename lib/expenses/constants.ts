import type { Database } from "@/types/database"
import { PAYMENT_METHOD_LABELS as BASE_PAYMENT_LABELS } from "@/lib/repairs/constants"

export type PaymentMethod = Database["public"]["Enums"]["payment_method"]

export const EXPENSE_PAYMENT_METHOD_LABELS = BASE_PAYMENT_LABELS

export const EXPENSE_PAYMENT_METHODS = [
  "cash",
  "card",
  "bank_transfer",
  "other",
] as const satisfies readonly PaymentMethod[]

export function isPaymentMethod(value: string): value is PaymentMethod {
  return (EXPENSE_PAYMENT_METHODS as readonly string[]).includes(value)
}

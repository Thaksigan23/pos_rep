import type { Database } from "@/types/database"

export type RepairStatus = Database["public"]["Enums"]["repair_status"]
export type RepairPriority = Database["public"]["Enums"]["repair_priority"]
export type AccessoryType = Database["public"]["Enums"]["accessory_type"]
export type IntakeCheckResult = Database["public"]["Enums"]["intake_check_result"]
export type EstimateStatus = Database["public"]["Enums"]["estimate_status"]
export type DeviceType = Database["public"]["Enums"]["device_type"]
export type ApprovalMethod = Database["public"]["Enums"]["approval_method"]
export type PaymentMethod = Database["public"]["Enums"]["payment_method"]

/** Mirrors public.repair_transition_allowed — display only; DB is authoritative. */
export const REPAIR_TRANSITIONS: Record<RepairStatus, readonly RepairStatus[]> = {
  received: ["diagnosing"],
  diagnosing: ["waiting_for_customer_approval", "approved"],
  waiting_for_customer_approval: ["approved", "diagnosing"],
  approved: ["waiting_for_parts", "in_repair"],
  waiting_for_parts: ["in_repair"],
  in_repair: ["testing", "waiting_for_parts"],
  testing: ["ready_for_pickup", "in_repair"],
  ready_for_pickup: ["completed"],
  completed: ["delivered"],
  delivered: [],
  cancelled: [],
}

export const REPAIR_STATUS_LABELS: Record<RepairStatus, string> = {
  received: "Received",
  diagnosing: "Diagnosing",
  waiting_for_customer_approval: "Waiting approval",
  approved: "Approved",
  waiting_for_parts: "Waiting parts",
  in_repair: "In repair",
  testing: "Testing",
  ready_for_pickup: "Ready for pickup",
  completed: "Completed",
  delivered: "Delivered",
  cancelled: "Cancelled",
}

export const REPAIR_STATUS_TABS: { value: RepairStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "received", label: "Received" },
  { value: "diagnosing", label: "Diagnosing" },
  { value: "waiting_for_customer_approval", label: "Waiting approval" },
  { value: "waiting_for_parts", label: "Waiting parts" },
  { value: "in_repair", label: "In repair" },
  { value: "testing", label: "Testing" },
  { value: "ready_for_pickup", label: "Ready for pickup" },
  { value: "completed", label: "Completed" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
]

export const REPAIR_PRIORITY_LABELS: Record<RepairPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
}

export const ACCESSORY_TYPES: AccessoryType[] = [
  "sim",
  "sim_tray",
  "charger",
  "cable",
  "case",
  "memory_card",
  "box",
  "other",
]

export const ACCESSORY_LABELS: Record<AccessoryType, string> = {
  sim: "SIM",
  sim_tray: "SIM tray",
  charger: "Charger",
  cable: "Cable",
  case: "Case",
  memory_card: "Memory card",
  box: "Box",
  other: "Other",
}

export const INTAKE_RESULT_LABELS: Record<IntakeCheckResult, string> = {
  working: "Working",
  not_working: "Not working",
  not_tested: "Not tested",
  not_applicable: "N/A",
}

export const ESTIMATE_STATUS_LABELS: Record<EstimateStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  approved: "Approved",
  rejected: "Rejected",
  expired: "Expired",
  superseded: "Superseded",
}

export const DEVICE_TYPE_LABELS: Record<DeviceType, string> = {
  phone: "Phone",
  tablet: "Tablet",
  laptop: "Laptop",
  watch: "Watch",
  other: "Other",
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  card: "Card",
  bank_transfer: "Bank transfer",
  other: "Other",
}

export function allowedTransitions(status: RepairStatus): readonly RepairStatus[] {
  return REPAIR_TRANSITIONS[status] ?? []
}

export function isRepairStatus(value: string): value is RepairStatus {
  return Object.prototype.hasOwnProperty.call(REPAIR_STATUS_LABELS, value)
}

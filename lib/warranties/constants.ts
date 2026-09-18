import type { Database } from "@/types/database"

export type WarrantyStatus = Database["public"]["Enums"]["warranty_status"]

export const WARRANTY_STATUS_LABELS: Record<WarrantyStatus, string> = {
  active: "Active",
  expired: "Expired",
  voided: "Voided",
  claimed: "Claimed",
}

export const WARRANTY_STATUS_TABS: {
  value: WarrantyStatus | "all"
  label: string
}[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "claimed", label: "Claimed" },
  { value: "expired", label: "Expired" },
  { value: "voided", label: "Voided" },
]

/** Claim statuses accepted by resolve_warranty_claim */
export const WARRANTY_CLAIM_STATUSES = [
  "open",
  "in_progress",
  "resolved",
  "rejected",
  "closed",
] as const

export type WarrantyClaimStatus = (typeof WARRANTY_CLAIM_STATUSES)[number]

export const WARRANTY_CLAIM_STATUS_LABELS: Record<WarrantyClaimStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
  rejected: "Rejected",
  closed: "Closed",
}

export function isWarrantyStatus(value: string): value is WarrantyStatus {
  return Object.prototype.hasOwnProperty.call(WARRANTY_STATUS_LABELS, value)
}

export function isWarrantyClaimStatus(value: string): value is WarrantyClaimStatus {
  return (WARRANTY_CLAIM_STATUSES as readonly string[]).includes(value)
}

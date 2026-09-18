import type { Database } from "@/types/database"

export type NotificationEventType =
  Database["public"]["Enums"]["notification_event_type"]

export const NOTIFICATION_EVENT_LABELS: Record<NotificationEventType, string> = {
  repair_ready_for_pickup: "Ready for pickup",
  repair_completed: "Repair completed",
  waiting_for_customer_approval: "Waiting for approval",
  low_stock: "Low stock",
  warranty_expiring: "Warranty expiring",
}

export function isNotificationEventType(
  value: string
): value is NotificationEventType {
  return Object.prototype.hasOwnProperty.call(NOTIFICATION_EVENT_LABELS, value)
}

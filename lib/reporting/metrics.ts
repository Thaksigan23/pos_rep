/**
 * Report / dashboard metric labels.
 * Values come from dashboard_summary / report_summary RPCs — do not invent fields.
 */

export const DASHBOARD_METRIC_LABELS = {
  sales_revenue: "Sales revenue",
  sales_count: "Sales count",
  repair_collected: "Repair collected",
  refunds: "Refunds",
  total_collected: "Total collected",
  expenses: "Expenses",
  net_cashflow: "Net cash flow",
  low_stock: "Low stock",
  out_of_stock: "Out of stock",
  overdue_repairs: "Overdue repairs",
  ready_for_pickup: "Ready for pickup",
} as const

export const REPORT_METRIC_LABELS = {
  sales_revenue: "Sales revenue",
  sales_count: "Sales",
  average_ticket: "Average ticket",
  discounts: "Discounts",
  tax: "Tax",
  refunds: "Refunds",
  net_sales: "Net sales (rev − refunds)",
  cogs: "COGS (sale cost snapshots)",
  gross_profit: "Gross profit (rev − COGS)",
  repair_billed: "Repairs billed",
  repair_collected: "Repairs collected",
  repair_completed: "Repairs completed",
  expenses_total: "Expenses",
  net_collected: "Net collected (receipts − refunds)",
  cash: "Cash",
  card: "Card",
  bank_transfer: "Bank transfer",
  other: "Other",
  warranties_active: "Active warranties",
  warranties_expiring: "Expiring soon",
  claims_opened: "Claims opened",
} as const

export const REPORT_EXPORT_TYPES = [
  "sales",
  "repairs",
  "expenses",
  "payments",
  "inventory",
] as const

export type ReportExportType = (typeof REPORT_EXPORT_TYPES)[number]

export function isReportExportType(value: string): value is ReportExportType {
  return (REPORT_EXPORT_TYPES as readonly string[]).includes(value)
}

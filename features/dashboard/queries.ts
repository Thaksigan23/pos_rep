import "server-only"

import type { Json } from "@/types/database"
import { createClient } from "@/lib/supabase/server"

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value)
    return Number.isFinite(n) ? n : fallback
  }
  return fallback
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback
}

function asStringMap(value: unknown): Record<string, number> {
  const record = asRecord(value)
  const out: Record<string, number> = {}
  for (const [key, raw] of Object.entries(record)) {
    out[key] = asNumber(raw)
  }
  return out
}

export type DashboardToday = {
  sales_revenue: number
  sales_count: number
  repair_collected: number
  refunds: number
  total_collected: number
  expenses?: number
  net_cashflow?: number
}

export type DashboardReadyPickup = {
  id: string
  ticket_number: string
  total: number
  updated_at: string
  first_name: string | null
  last_name: string | null
}

export type DashboardOutstanding = {
  id: string
  ticket_number: string
  total: number
  paid: number
  outstanding: number
}

export type DashboardRecentSale = {
  id: string
  sale_number: string
  total: number
  completed_at: string | null
  status: string
}

export type DashboardAssignedJob = {
  id: string
  ticket_number: string
  status: string
  priority: string
  reported_issue: string | null
  updated_at: string
}

export type DashboardLowStockItem = {
  product_id: string
  name: string | null
  sku: string | null
  quantity: number | null
  stock_status: string | null
}

export type DashboardSummary = {
  shop_id: string
  local_date: string
  timezone: string
  repairs: Record<string, number>
  ready_for_pickup: DashboardReadyPickup[]
  overdue_repairs: number
  today?: DashboardToday
  recent_sales?: DashboardRecentSale[]
  outstanding_repairs?: DashboardOutstanding[]
  inventory?: {
    low_stock: number
    out_of_stock: number
    low_stock_items: DashboardLowStockItem[]
  }
  assigned_jobs?: DashboardAssignedJob[]
}

function parseReadyPickup(raw: unknown): DashboardReadyPickup[] {
  return asArray(raw).map((row) => {
    const r = asRecord(row)
    return {
      id: asString(r.id),
      ticket_number: asString(r.ticket_number),
      total: asNumber(r.total),
      updated_at: asString(r.updated_at),
      first_name: typeof r.first_name === "string" ? r.first_name : null,
      last_name: typeof r.last_name === "string" ? r.last_name : null,
    }
  })
}

function parseOutstanding(raw: unknown): DashboardOutstanding[] {
  return asArray(raw).map((row) => {
    const r = asRecord(row)
    return {
      id: asString(r.id),
      ticket_number: asString(r.ticket_number),
      total: asNumber(r.total),
      paid: asNumber(r.paid),
      outstanding: asNumber(r.outstanding),
    }
  })
}

function parseRecentSales(raw: unknown): DashboardRecentSale[] {
  return asArray(raw).map((row) => {
    const r = asRecord(row)
    return {
      id: asString(r.id),
      sale_number: asString(r.sale_number),
      total: asNumber(r.total),
      completed_at: typeof r.completed_at === "string" ? r.completed_at : null,
      status: asString(r.status),
    }
  })
}

function parseAssignedJobs(raw: unknown): DashboardAssignedJob[] {
  return asArray(raw).map((row) => {
    const r = asRecord(row)
    return {
      id: asString(r.id),
      ticket_number: asString(r.ticket_number),
      status: asString(r.status),
      priority: asString(r.priority),
      reported_issue:
        typeof r.reported_issue === "string" ? r.reported_issue : null,
      updated_at: asString(r.updated_at),
    }
  })
}

function parseLowStockItems(raw: unknown): DashboardLowStockItem[] {
  return asArray(raw).map((row) => {
    const r = asRecord(row)
    return {
      product_id: asString(r.product_id),
      name: typeof r.name === "string" ? r.name : null,
      sku: typeof r.sku === "string" ? r.sku : null,
      quantity:
        r.quantity === null || r.quantity === undefined
          ? null
          : asNumber(r.quantity),
      stock_status: typeof r.stock_status === "string" ? r.stock_status : null,
    }
  })
}

export function parseDashboardSummary(raw: Json | null | undefined): DashboardSummary {
  const root = asRecord(raw)
  const todayRaw = root.today !== undefined ? asRecord(root.today) : null
  const inventoryRaw =
    root.inventory !== undefined ? asRecord(root.inventory) : null

  const summary: DashboardSummary = {
    shop_id: asString(root.shop_id),
    local_date: asString(root.local_date),
    timezone: asString(root.timezone, "UTC"),
    repairs: asStringMap(root.repairs),
    ready_for_pickup: parseReadyPickup(root.ready_for_pickup),
    overdue_repairs: asNumber(root.overdue_repairs),
  }

  if (todayRaw) {
    const today: DashboardToday = {
      sales_revenue: asNumber(todayRaw.sales_revenue),
      sales_count: asNumber(todayRaw.sales_count),
      repair_collected: asNumber(todayRaw.repair_collected),
      refunds: asNumber(todayRaw.refunds),
      total_collected: asNumber(todayRaw.total_collected),
    }
    if ("expenses" in todayRaw) today.expenses = asNumber(todayRaw.expenses)
    if ("net_cashflow" in todayRaw) {
      today.net_cashflow = asNumber(todayRaw.net_cashflow)
    }
    summary.today = today
  }

  if (root.recent_sales !== undefined) {
    summary.recent_sales = parseRecentSales(root.recent_sales)
  }
  if (root.outstanding_repairs !== undefined) {
    summary.outstanding_repairs = parseOutstanding(root.outstanding_repairs)
  }
  if (inventoryRaw) {
    summary.inventory = {
      low_stock: asNumber(inventoryRaw.low_stock),
      out_of_stock: asNumber(inventoryRaw.out_of_stock),
      low_stock_items: parseLowStockItems(inventoryRaw.low_stock_items),
    }
  }
  if (root.assigned_jobs !== undefined) {
    summary.assigned_jobs = parseAssignedJobs(root.assigned_jobs)
  }

  return summary
}

export async function getDashboardSummary(shopId: string): Promise<DashboardSummary> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("dashboard_summary", {
    p_shop_id: shopId,
  })
  if (error) throw new Error(error.message)
  return parseDashboardSummary(data)
}

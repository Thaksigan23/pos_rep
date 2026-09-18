import "server-only"

import type { Json } from "@/types/database"
import { createClient } from "@/lib/supabase/server"
import type { ReportExportType } from "@/lib/reporting/metrics"

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

export type ReportSummary = {
  shop_id: string
  from: string
  to: string
  timezone: string
  sales: {
    revenue: number
    count: number
    average_ticket: number
    discounts: number
    tax: number
    refunds: number
    net_sales: number
    cogs: number
    gross_profit: number
  }
  repairs: {
    billed: number
    collected: number
    completed_count: number
    status_distribution: Record<string, number>
  }
  payments: {
    cash: number
    card: number
    bank_transfer: number
    other: number
    refunds: number
    net_collected: number
  }
  expenses: {
    total: number
    by_category: { category: string; total: number }[]
  }
  inventory: {
    low_stock: number
    out_of_stock: number
  }
  warranties: {
    active: number
    expiring_soon: number
    claims_opened: number
  }
  sales_over_time: { day: string; revenue: number; count: number }[]
  expenses_over_time: { day: string; total: number }[]
}

export function parseReportSummary(raw: Json | null | undefined): ReportSummary {
  const root = asRecord(raw)
  const sales = asRecord(root.sales)
  const repairs = asRecord(root.repairs)
  const payments = asRecord(root.payments)
  const expenses = asRecord(root.expenses)
  const inventory = asRecord(root.inventory)
  const warranties = asRecord(root.warranties)

  return {
    shop_id: asString(root.shop_id),
    from: asString(root.from),
    to: asString(root.to),
    timezone: asString(root.timezone, "UTC"),
    sales: {
      revenue: asNumber(sales.revenue),
      count: asNumber(sales.count),
      average_ticket: asNumber(sales.average_ticket),
      discounts: asNumber(sales.discounts),
      tax: asNumber(sales.tax),
      refunds: asNumber(sales.refunds),
      net_sales: asNumber(sales.net_sales),
      cogs: asNumber(sales.cogs),
      gross_profit: asNumber(sales.gross_profit),
    },
    repairs: {
      billed: asNumber(repairs.billed),
      collected: asNumber(repairs.collected),
      completed_count: asNumber(repairs.completed_count),
      status_distribution: asStringMap(repairs.status_distribution),
    },
    payments: {
      cash: asNumber(payments.cash),
      card: asNumber(payments.card),
      bank_transfer: asNumber(payments.bank_transfer),
      other: asNumber(payments.other),
      refunds: asNumber(payments.refunds),
      net_collected: asNumber(payments.net_collected),
    },
    expenses: {
      total: asNumber(expenses.total),
      by_category: asArray(expenses.by_category).map((row) => {
        const r = asRecord(row)
        return {
          category: asString(r.category, "Other"),
          total: asNumber(r.total),
        }
      }),
    },
    inventory: {
      low_stock: asNumber(inventory.low_stock),
      out_of_stock: asNumber(inventory.out_of_stock),
    },
    warranties: {
      active: asNumber(warranties.active),
      expiring_soon: asNumber(warranties.expiring_soon),
      claims_opened: asNumber(warranties.claims_opened),
    },
    sales_over_time: asArray(root.sales_over_time).map((row) => {
      const r = asRecord(row)
      return {
        day: asString(r.day),
        revenue: asNumber(r.revenue),
        count: asNumber(r.count),
      }
    }),
    expenses_over_time: asArray(root.expenses_over_time).map((row) => {
      const r = asRecord(row)
      return {
        day: asString(r.day),
        total: asNumber(r.total),
      }
    }),
  }
}

export async function getReportSummary(
  shopId: string,
  from: string,
  to: string
): Promise<ReportSummary> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("report_summary", {
    p_shop_id: shopId,
    p_from: from,
    p_to: to,
  })
  if (error) throw new Error(error.message)
  return parseReportSummary(data)
}

function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => row.map(csvEscape).join(",")),
  ]
  return lines.join("\n")
}

const EXPORT_PAGE = 500
const EXPORT_MAX_ROWS = 5000

async function fetchAll<T>(
  fetchPage: (from: number, to: number) => Promise<T[]>
): Promise<T[]> {
  const all: T[] = []
  for (let offset = 0; offset < EXPORT_MAX_ROWS; offset += EXPORT_PAGE) {
    const page = await fetchPage(offset, offset + EXPORT_PAGE - 1)
    all.push(...page)
    if (page.length < EXPORT_PAGE) break
  }
  return all
}

/** Inclusive local dates → timestamptz bounds via shop_local_day_bounds. */
async function shopRangeBounds(shopId: string, from: string, to: string) {
  const supabase = await createClient()
  const [{ data: fromBound, error: fromErr }, { data: toBound, error: toErr }] =
    await Promise.all([
      supabase.rpc("shop_local_day_bounds", {
        p_shop_id: shopId,
        p_date: from,
      }),
      supabase.rpc("shop_local_day_bounds", {
        p_shop_id: shopId,
        p_date: to,
      }),
    ])
  if (fromErr) throw new Error(fromErr.message)
  if (toErr) throw new Error(toErr.message)
  const startRow = Array.isArray(fromBound) ? fromBound[0] : fromBound
  const endRow = Array.isArray(toBound) ? toBound[0] : toBound
  const startAt = (startRow as { start_at?: string } | null)?.start_at
  const endAt = (endRow as { end_at?: string } | null)?.end_at
  if (!startAt || !endAt) throw new Error("Could not resolve shop date bounds.")
  return { startAt, endAt }
}

export async function buildReportCsv(options: {
  type: ReportExportType
  shopId: string
  from: string
  to: string
  includeCosts: boolean
}): Promise<{ filename: string; csv: string }> {
  const supabase = await createClient()
  const { type, shopId, from, to, includeCosts } = options
  const { startAt, endAt } = await shopRangeBounds(shopId, from, to)

  if (type === "sales") {
    const sales = await fetchAll(async (rangeFrom, rangeTo) => {
      const { data, error } = await supabase
        .from("sales")
        .select(
          "id, sale_number, status, subtotal, discount_amount, tax_amount, total, completed_at"
        )
        .eq("shop_id", shopId)
        .eq("status", "completed")
        .gte("completed_at", startAt)
        .lt("completed_at", endAt)
        .order("completed_at", { ascending: true })
        .range(rangeFrom, rangeTo)
      if (error) throw new Error(error.message)
      return data ?? []
    })

    const costBySale = new Map<string, number>()
    if (includeCosts && sales.length > 0) {
      for (let i = 0; i < sales.length; i += 50) {
        const chunk = sales.slice(i, i + 50).map((s) => s.id)
        const { data: items, error } = await supabase
          .from("sale_items")
          .select("sale_id, quantity, sale_item_costs(unit_cost)")
          .in("sale_id", chunk)
        if (error) throw new Error(error.message)
        for (const item of items ?? []) {
          const costsRaw = item.sale_item_costs as unknown
          const costs = Array.isArray(costsRaw)
            ? (costsRaw[0] as { unit_cost: number } | undefined)
            : (costsRaw as { unit_cost: number } | null)
          const unit = costs ? Number(costs.unit_cost) : 0
          const add = Number(item.quantity) * unit
          costBySale.set(item.sale_id, (costBySale.get(item.sale_id) ?? 0) + add)
        }
      }
    }

    const headers = includeCosts
      ? [
          "sale_number",
          "status",
          "subtotal",
          "discount_amount",
          "tax_amount",
          "total",
          "cogs",
          "completed_at",
        ]
      : [
          "sale_number",
          "status",
          "subtotal",
          "discount_amount",
          "tax_amount",
          "total",
          "completed_at",
        ]

    const csv = toCsv(
      headers,
      sales.map((r) => {
        const base = [
          r.sale_number,
          r.status,
          r.subtotal,
          r.discount_amount,
          r.tax_amount,
          r.total,
        ]
        if (includeCosts) {
          return [
            ...base,
            Number((costBySale.get(r.id) ?? 0).toFixed(2)),
            r.completed_at,
          ]
        }
        return [...base, r.completed_at]
      })
    )
    return { filename: `sales_${from}_${to}.csv`, csv }
  }

  if (type === "repairs") {
    const rows = await fetchAll(async (rangeFrom, rangeTo) => {
      const { data, error } = await supabase
        .from("repair_jobs")
        .select(
          "ticket_number, status, priority, total, tax_amount, discount_amount, created_at, completed_at"
        )
        .eq("shop_id", shopId)
        .gte("created_at", startAt)
        .lt("created_at", endAt)
        .order("created_at", { ascending: true })
        .range(rangeFrom, rangeTo)
      if (error) throw new Error(error.message)
      return data ?? []
    })
    const csv = toCsv(
      [
        "ticket_number",
        "status",
        "priority",
        "total",
        "tax_amount",
        "discount_amount",
        "created_at",
        "completed_at",
      ],
      rows.map((r) => [
        r.ticket_number,
        r.status,
        r.priority,
        r.total,
        r.tax_amount,
        r.discount_amount,
        r.created_at,
        r.completed_at,
      ])
    )
    return { filename: `repairs_${from}_${to}.csv`, csv }
  }

  if (type === "expenses") {
    const rows = await fetchAll(async (rangeFrom, rangeTo) => {
      const { data, error } = await supabase
        .from("expenses")
        .select(
          "expense_date, amount, payment_method, description, expense_categories(name)"
        )
        .eq("shop_id", shopId)
        .gte("expense_date", from)
        .lte("expense_date", to)
        .order("expense_date", { ascending: true })
        .range(rangeFrom, rangeTo)
      if (error) throw new Error(error.message)
      return data ?? []
    })
    const csv = toCsv(
      ["expense_date", "category", "amount", "payment_method", "description"],
      rows.map((r) => {
        const cat = r.expense_categories as { name: string } | null
        return [
          r.expense_date,
          cat?.name ?? "",
          r.amount,
          r.payment_method,
          r.description,
        ]
      })
    )
    return { filename: `expenses_${from}_${to}.csv`, csv }
  }

  if (type === "payments") {
    const rows = await fetchAll(async (rangeFrom, rangeTo) => {
      const { data, error } = await supabase
        .from("payments")
        .select(
          "created_at, amount, method, entry_type, reference_type, reference_id, voided_at"
        )
        .eq("shop_id", shopId)
        .is("voided_at", null)
        .gte("created_at", startAt)
        .lt("created_at", endAt)
        .order("created_at", { ascending: true })
        .range(rangeFrom, rangeTo)
      if (error) throw new Error(error.message)
      return data ?? []
    })
    const csv = toCsv(
      [
        "created_at",
        "amount",
        "method",
        "entry_type",
        "reference_type",
        "reference_id",
      ],
      rows.map((r) => [
        r.created_at,
        r.amount,
        r.method,
        r.entry_type,
        r.reference_type,
        r.reference_id,
      ])
    )
    return { filename: `payments_${from}_${to}.csv`, csv }
  }

  const rows = await fetchAll(async (rangeFrom, rangeTo) => {
    const { data, error } = await supabase
      .from("inventory_movements")
      .select(
        "created_at, movement_type, quantity_change, product_id, reference_type, reference_id, notes, products(name, sku)"
      )
      .eq("shop_id", shopId)
      .gte("created_at", startAt)
      .lt("created_at", endAt)
      .order("created_at", { ascending: true })
      .range(rangeFrom, rangeTo)
    if (error) throw new Error(error.message)
    return data ?? []
  })
  const csv = toCsv(
    [
      "created_at",
      "sku",
      "product",
      "movement_type",
      "quantity_change",
      "reference_type",
      "reference_id",
      "notes",
    ],
    rows.map((r) => {
      const product = r.products as { name: string; sku: string } | null
      return [
        r.created_at,
        product?.sku ?? "",
        product?.name ?? "",
        r.movement_type,
        r.quantity_change,
        r.reference_type,
        r.reference_id,
        r.notes,
      ]
    })
  )
  return { filename: `inventory_${from}_${to}.csv`, csv }
}

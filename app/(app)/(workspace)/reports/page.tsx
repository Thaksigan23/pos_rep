import type { Metadata } from "next"
import Link from "next/link"
import { BarChart3, Download, FileDown } from "lucide-react"

import { PageHeader } from "@/components/app/page-header"
import { buttonVariants } from "@/components/ui/button"
import { ReportCharts } from "@/features/reports/components/report-charts"
import { getReportSummary } from "@/features/reports/queries"
import { canPerform } from "@/lib/auth/permissions"
import { requirePageAccess } from "@/lib/auth/workspace"
import { formatCurrency } from "@/lib/money/currency"
import { formatDisplayDate } from "@/lib/datetime/format"
import { APP_ROUTES, firstSearchParam } from "@/lib/navigation/paths"
import { REPORT_EXPORT_TYPES } from "@/lib/reporting/metrics"
import {
  localDateString,
  reportRangePreset,
  type ReportRangePreset,
} from "@/lib/reporting/timezone"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Reports" }

const PRESETS: { value: ReportRangePreset | "custom"; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this_week", label: "This week" },
  { value: "this_month", label: "This month" },
  { value: "custom", label: "Custom" },
]

function Metric({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="panel panel-pad py-3">
      <p className="section-label">{label}</p>
      <p className="mt-1.5 text-lg font-semibold tabular-nums tracking-tight">
        {value}
      </p>
      {hint ? <p className="muted-xs mt-1 leading-snug">{hint}</p> : null}
    </div>
  )
}

function isPreset(value: string): value is ReportRangePreset {
  return (
    value === "today" ||
    value === "yesterday" ||
    value === "this_week" ||
    value === "this_month"
  )
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requirePageAccess("reports")
  const showCost = canPerform(session.role, "viewCostPrices")

  const params = await searchParams
  const timezone = session.shopSettings.timezone
  const presetParam = firstSearchParam(params.preset) ?? "this_month"
  const customFrom = firstSearchParam(params.from) ?? ""
  const customTo = firstSearchParam(params.to) ?? ""

  let from: string
  let to: string
  let preset: ReportRangePreset | "custom"

  if (isPreset(presetParam)) {
    preset = presetParam
    ;({ from, to } = reportRangePreset(presetParam, timezone))
  } else if (customFrom && customTo && customTo >= customFrom) {
    preset = "custom"
    from = customFrom
    to = customTo
  } else {
    preset = "this_month"
    ;({ from, to } = reportRangePreset("this_month", timezone))
  }

  const summary = await getReportSummary(session.shop.id, from, to)
  const { currencyCode, currencyLocale } = session.shopSettings
  const money = (n: number) => formatCurrency(n, currencyCode, currencyLocale)
  const rangeLabel =
    from === to
      ? formatDisplayDate(from)
      : `${formatDisplayDate(from)} → ${formatDisplayDate(to)}`
  const presetLabel =
    PRESETS.find((p) => p.value === preset)?.label ?? "Custom"

  function presetHref(value: ReportRangePreset | "custom") {
    if (value === "custom") {
      return `${APP_ROUTES.reports}?preset=custom&from=${from}&to=${to}`
    }
    return `${APP_ROUTES.reports}?preset=${value}`
  }

  function exportHref(type: string) {
    return `/reports/export?type=${type}&from=${from}&to=${to}`
  }

  const pdfHref = `/reports/export/pdf?from=${from}&to=${to}`

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow={session.shop.name}
        title="Reports"
        description={`${presetLabel} · ${rangeLabel} · ${timezone}`}
        icon={BarChart3}
        actions={
          <Link
            href={pdfHref}
            className={cn(buttonVariants({ size: "sm" }), "btn-h")}
          >
            <FileDown className="size-3.5" />
            Generate PDF
          </Link>
        }
      />

      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <Link
            key={p.value}
            href={presetHref(p.value)}
            className={cn(
              buttonVariants({
                variant: preset === p.value ? "default" : "outline",
                size: "sm",
              }),
              "btn-h"
            )}
          >
            {p.label}
          </Link>
        ))}
      </div>

      {preset === "custom" ? (
        <form
          className="panel panel-pad flex flex-wrap items-end gap-2"
          method="get"
        >
          <input type="hidden" name="preset" value="custom" />
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">From</span>
            <input
              type="date"
              name="from"
              defaultValue={from}
              max={localDateString(timezone)}
              className="control-h h-10 rounded-lg border border-input bg-background px-3 text-sm"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">To</span>
            <input
              type="date"
              name="to"
              defaultValue={to}
              max={localDateString(timezone)}
              className="control-h h-10 rounded-lg border border-input bg-background px-3 text-sm"
            />
          </label>
          <button
            type="submit"
            className={cn(buttonVariants({ variant: "outline" }), "btn-h h-10 px-4")}
          >
            Apply
          </button>
        </form>
      ) : null}

      <div>
        <p className="section-label mb-2">
          Financial · {rangeLabel}
        </p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="Sales revenue"
            value={money(summary.sales.revenue)}
            hint="Completed sale totals"
          />
          <Metric
            label="Net sales"
            value={money(summary.sales.net_sales)}
            hint="Revenue − refunds"
          />
          {showCost ? (
            <Metric
              label="Gross profit"
              value={money(summary.sales.gross_profit)}
              hint="Revenue − COGS (not net sales)"
            />
          ) : null}
          {showCost ? (
            <Metric
              label="COGS"
              value={money(summary.sales.cogs)}
              hint="Historical sale_item_costs"
            />
          ) : null}
          <Metric
            label="Expenses"
            value={money(summary.expenses.total)}
            hint="Expense dates in range"
          />
          <Metric
            label="Repairs collected"
            value={money(summary.repairs.collected)}
            hint="Repair payment receipts"
          />
          <Metric
            label="Net collected"
            value={money(summary.payments.net_collected)}
            hint="All receipts − refunds"
          />
          <Metric
            label="Avg ticket"
            value={money(summary.sales.average_ticket)}
            hint="Revenue ÷ sale count"
          />
        </div>
      </div>

      <div>
        <p className="section-label mb-2">Volume</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Sales count" value={String(summary.sales.count)} />
          <Metric
            label="Repairs completed"
            value={String(summary.repairs.completed_count)}
          />
          <Metric
            label="Active warranties"
            value={String(summary.warranties.active)}
          />
          <Metric
            label="Claims opened"
            value={String(summary.warranties.claims_opened)}
          />
        </div>
      </div>

      <ReportCharts
        summary={summary}
        currencyCode={currencyCode}
        currencyLocale={currencyLocale}
      />

      <section className="panel panel-pad space-y-4">
        <div>
          <p className="section-label">Generate PDF</p>
          <p className="muted-xs mt-1">
            Download a printable summary for {rangeLabel}.
          </p>
          <div className="mt-3">
            <Link
              href={pdfHref}
              className={cn(buttonVariants({ size: "sm" }), "btn-h")}
            >
              <FileDown className="size-3.5" />
              Download PDF report
            </Link>
          </div>
        </div>

        <div className="border-t pt-4">
          <p className="section-label">Export CSV</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {REPORT_EXPORT_TYPES.map((type) => (
              <Link
                key={type}
                href={exportHref(type)}
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "btn-h"
                )}
              >
                <Download className="size-3.5" />
                {type}
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

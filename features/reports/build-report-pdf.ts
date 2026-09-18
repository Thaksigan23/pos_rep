import "server-only"

import { PDFDocument, StandardFonts, rgb } from "pdf-lib"

import type { ReportSummary } from "@/features/reports/queries"

function money(amount: number, currencyCode: string): string {
  const n = Number.isFinite(amount) ? amount : 0
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
  return `${currencyCode} ${formatted}`
}

function asciiSafe(text: string): string {
  return text.replace(/[^\x20-\x7E]/g, "?")
}

type PdfRow = { label: string; value: string }

export async function buildReportPdf(options: {
  shopName: string
  summary: ReportSummary
  currencyCode: string
  includeCosts: boolean
  rangeLabel: string
  generatedAt: string
}): Promise<{ filename: string; bytes: Uint8Array }> {
  const {
    shopName,
    summary,
    currencyCode,
    includeCosts,
    rangeLabel,
    generatedAt,
  } = options

  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)

  const pageWidth = 595.28
  const pageHeight = 841.89
  const margin = 48
  const contentWidth = pageWidth - margin * 2
  let page = doc.addPage([pageWidth, pageHeight])
  let y = pageHeight - margin

  const ensureSpace = (needed: number) => {
    if (y - needed < margin) {
      page = doc.addPage([pageWidth, pageHeight])
      y = pageHeight - margin
    }
  }

  const drawText = (
    text: string,
    x: number,
    size: number,
    bold = false,
    color = rgb(0.1, 0.1, 0.12)
  ) => {
    page.drawText(asciiSafe(text), {
      x,
      y,
      size,
      font: bold ? fontBold : font,
      color,
    })
  }

  const section = (title: string) => {
    ensureSpace(36)
    y -= 8
    page.drawLine({
      start: { x: margin, y: y + 14 },
      end: { x: margin + contentWidth, y: y + 14 },
      thickness: 0.5,
      color: rgb(0.85, 0.85, 0.88),
    })
    drawText(title, margin, 11, true, rgb(0.25, 0.25, 0.3))
    y -= 18
  }

  const rows = (items: PdfRow[]) => {
    for (const item of items) {
      ensureSpace(18)
      drawText(item.label, margin, 10, false, rgb(0.35, 0.35, 0.4))
      const valueWidth = fontBold.widthOfTextAtSize(asciiSafe(item.value), 10)
      drawText(
        item.value,
        margin + contentWidth - valueWidth,
        10,
        true,
        rgb(0.1, 0.1, 0.12)
      )
      y -= 16
    }
  }

  drawText(shopName, margin, 16, true)
  y -= 22
  drawText("Business report", margin, 12, true, rgb(0.2, 0.2, 0.25))
  y -= 18
  drawText(`Period: ${rangeLabel}`, margin, 10, false, rgb(0.4, 0.4, 0.45))
  y -= 14
  drawText(`Timezone: ${summary.timezone}`, margin, 10, false, rgb(0.4, 0.4, 0.45))
  y -= 14
  drawText(`Generated: ${generatedAt}`, margin, 10, false, rgb(0.4, 0.4, 0.45))
  y -= 10

  const financial: PdfRow[] = [
    { label: "Sales revenue", value: money(summary.sales.revenue, currencyCode) },
    { label: "Net sales", value: money(summary.sales.net_sales, currencyCode) },
    { label: "Discounts", value: money(summary.sales.discounts, currencyCode) },
    { label: "Tax", value: money(summary.sales.tax, currencyCode) },
    { label: "Refunds", value: money(summary.sales.refunds, currencyCode) },
    {
      label: "Average ticket",
      value: money(summary.sales.average_ticket, currencyCode),
    },
  ]
  if (includeCosts) {
    financial.push(
      { label: "COGS", value: money(summary.sales.cogs, currencyCode) },
      {
        label: "Gross profit",
        value: money(summary.sales.gross_profit, currencyCode),
      }
    )
  }
  financial.push(
    { label: "Expenses", value: money(summary.expenses.total, currencyCode) },
    {
      label: "Repairs collected",
      value: money(summary.repairs.collected, currencyCode),
    },
    {
      label: "Net collected",
      value: money(summary.payments.net_collected, currencyCode),
    }
  )

  section("Financial summary")
  rows(financial)

  section("Volume")
  rows([
    { label: "Sales count", value: String(summary.sales.count) },
    {
      label: "Repairs completed",
      value: String(summary.repairs.completed_count),
    },
    { label: "Active warranties", value: String(summary.warranties.active) },
    {
      label: "Warranties expiring soon",
      value: String(summary.warranties.expiring_soon),
    },
    {
      label: "Claims opened",
      value: String(summary.warranties.claims_opened),
    },
    { label: "Low stock SKUs", value: String(summary.inventory.low_stock) },
    {
      label: "Out of stock SKUs",
      value: String(summary.inventory.out_of_stock),
    },
  ])

  section("Payments breakdown")
  rows([
    { label: "Cash", value: money(summary.payments.cash, currencyCode) },
    { label: "Card", value: money(summary.payments.card, currencyCode) },
    {
      label: "Bank transfer",
      value: money(summary.payments.bank_transfer, currencyCode),
    },
    { label: "Other", value: money(summary.payments.other, currencyCode) },
    {
      label: "Refunds",
      value: money(summary.payments.refunds, currencyCode),
    },
  ])

  if (summary.expenses.by_category.length > 0) {
    section("Expenses by category")
    rows(
      summary.expenses.by_category.map((c) => ({
        label: c.category || "Other",
        value: money(c.total, currencyCode),
      }))
    )
  }

  const statusEntries = Object.entries(summary.repairs.status_distribution)
  if (statusEntries.length > 0) {
    section("Repair status distribution")
    rows(
      statusEntries.map(([status, count]) => ({
        label: status.replace(/_/g, " "),
        value: String(count),
      }))
    )
  }

  if (summary.sales_over_time.length > 0) {
    section("Sales by day")
    rows(
      summary.sales_over_time.slice(0, 45).map((d) => ({
        label: `${d.day} (${d.count} sales)`,
        value: money(d.revenue, currencyCode),
      }))
    )
    if (summary.sales_over_time.length > 45) {
      ensureSpace(16)
      drawText(
        `… and ${summary.sales_over_time.length - 45} more days`,
        margin,
        9,
        false,
        rgb(0.45, 0.45, 0.5)
      )
      y -= 14
    }
  }

  ensureSpace(28)
  y -= 12
  page.drawLine({
    start: { x: margin, y: y + 10 },
    end: { x: margin + contentWidth, y: y + 10 },
    thickness: 0.5,
    color: rgb(0.85, 0.85, 0.88),
  })
  drawText(
    "Generated by MobilePOS",
    margin,
    8,
    false,
    rgb(0.55, 0.55, 0.6)
  )

  const bytes = await doc.save()
  return {
    filename: `report_${summary.from}_${summary.to}.pdf`,
    bytes,
  }
}

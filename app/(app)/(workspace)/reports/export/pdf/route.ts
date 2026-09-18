import { NextResponse, type NextRequest } from "next/server"

import { buildReportPdf } from "@/features/reports/build-report-pdf"
import { getReportSummary } from "@/features/reports/queries"
import { canPerform } from "@/lib/auth/permissions"
import { getAuthWorkspaceState } from "@/lib/auth/workspace"
import { formatDisplayDate } from "@/lib/datetime/format"
import { AUTH_ROUTES } from "@/lib/navigation/paths"
import { reportRangePreset } from "@/lib/reporting/timezone"

export async function GET(request: NextRequest) {
  const state = await getAuthWorkspaceState()
  if (state.kind === "unauthenticated") {
    return NextResponse.redirect(new URL(AUTH_ROUTES.login, request.url))
  }
  if (state.kind !== "ready") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const session = state.session
  if (!canPerform(session.role, "viewFullReports")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = request.nextUrl
  const timezone = session.shopSettings.timezone
  const defaultRange = reportRangePreset("this_month", timezone)
  const from = searchParams.get("from") || defaultRange.from
  const to = searchParams.get("to") || defaultRange.to

  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 })
  }
  if (to < from) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 })
  }

  try {
    const summary = await getReportSummary(session.shop.id, from, to)
    const rangeLabel =
      from === to
        ? formatDisplayDate(from)
        : `${formatDisplayDate(from)} - ${formatDisplayDate(to)}`

    const { filename, bytes } = await buildReportPdf({
      shopName: session.shop.name,
      summary,
      currencyCode: session.shopSettings.currencyCode,
      includeCosts: canPerform(session.role, "viewCostPrices"),
      rangeLabel,
      generatedAt: new Date().toISOString(),
    })

    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "PDF export failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

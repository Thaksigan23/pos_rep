import { NextResponse, type NextRequest } from "next/server"

import { buildReportCsv } from "@/features/reports/queries"
import { canPerform } from "@/lib/auth/permissions"
import { getAuthWorkspaceState } from "@/lib/auth/workspace"
import { isReportExportType } from "@/lib/reporting/metrics"
import { reportRangePreset } from "@/lib/reporting/timezone"
import { AUTH_ROUTES } from "@/lib/navigation/paths"

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
  const type = searchParams.get("type") ?? ""
  if (!isReportExportType(type)) {
    return NextResponse.json({ error: "Invalid export type" }, { status: 400 })
  }

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
    const { filename, csv } = await buildReportCsv({
      type,
      shopId: session.shop.id,
      from,
      to,
      includeCosts:
        type === "sales" &&
        (session.role === "owner" || session.role === "admin"),
    })

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Export failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

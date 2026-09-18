import { NextResponse } from "next/server"

import { getAppBuildId } from "@/lib/app-build"

export const dynamic = "force-dynamic"

export async function GET() {
  return NextResponse.json(
    {
      buildId: getAppBuildId(),
      generatedAt: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  )
}

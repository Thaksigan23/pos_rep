import { NextResponse, type NextRequest } from "next/server"

import { AUTH_ROUTES, safeInternalPath } from "@/lib/navigation/paths"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const next = safeInternalPath(
    searchParams.get("next"),
    AUTH_ROUTES.resetPassword
  )

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      const forwardedHost = request.headers.get("x-forwarded-host")
      const isLocal = process.env.NODE_ENV === "development"
      const redirectBase =
        !isLocal && forwardedHost ? `https://${forwardedHost}` : origin

      return NextResponse.redirect(`${redirectBase}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}${AUTH_ROUTES.login}?error=auth`)
}

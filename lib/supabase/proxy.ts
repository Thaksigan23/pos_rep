import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/env"
import {
  AUTH_ROUTES,
  isAuthEntryPath,
  isPublicPath,
  safeInternalPath,
} from "@/lib/navigation/paths"
import type { Database } from "@/types/database"

function copySession(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie)
  })

  for (const header of ["cache-control", "expires", "pragma"] as const) {
    const value = from.headers.get(header)
    if (value) {
      to.headers.set(header, value)
    }
  }

  return to
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value)
        })
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options)
        })
        Object.entries(headers).forEach(([key, value]) => {
          supabaseResponse.headers.set(key, value)
        })
      },
    },
  })

  const { data } = await supabase.auth.getClaims()
  const isAuthenticated = Boolean(data?.claims)
  const { pathname } = request.nextUrl

  if (!isAuthenticated && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = AUTH_ROUTES.login
    url.searchParams.set("next", pathname)
    return copySession(supabaseResponse, NextResponse.redirect(url))
  }

  if (isAuthenticated && isAuthEntryPath(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = safeInternalPath(request.nextUrl.searchParams.get("next"))
    url.search = ""
    return copySession(supabaseResponse, NextResponse.redirect(url))
  }

  return supabaseResponse
}

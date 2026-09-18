import type { Metadata } from "next"
import { Smartphone } from "lucide-react"

import { LoginForm } from "@/features/auth/components/login-form"
import { firstSearchParam, safeInternalPath } from "@/lib/navigation/paths"

export const metadata: Metadata = {
  title: "Sign in",
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    next?: string | string[]
    error?: string | string[]
  }>
}) {
  const params = await searchParams
  const nextPath = safeInternalPath(firstSearchParam(params.next))
  const errorMessage =
    firstSearchParam(params.error) === "auth"
      ? "The sign-in link is invalid or has expired. Try again."
      : undefined

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 lg:hidden">
        <div className="flex size-9 items-center justify-center rounded-lg brand-accent">
          <Smartphone className="size-4" aria-hidden />
        </div>
        <div>
          <p className="text-sm font-semibold tracking-wide">MobilePOS</p>
          <p className="text-xs text-muted-foreground">Repair & retail</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <h1 className="heading-page">Sign in</h1>
        <p className="muted-sm">Use your staff email and password.</p>
      </div>

      <LoginForm nextPath={nextPath} errorMessage={errorMessage} />
    </div>
  )
}

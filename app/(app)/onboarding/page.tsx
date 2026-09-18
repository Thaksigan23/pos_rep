import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { Smartphone } from "lucide-react"

import { AccessDenied } from "@/components/app/access-denied"
import { OnboardingForm } from "@/features/onboarding/onboarding-form"
import { getAuthWorkspaceState } from "@/lib/auth/workspace"
import { AUTH_ROUTES, APP_ROUTES } from "@/lib/navigation/paths"

export const metadata: Metadata = {
  title: "Set up shop",
}

export default async function OnboardingPage() {
  const state = await getAuthWorkspaceState()

  if (state.kind === "unauthenticated") {
    redirect(AUTH_ROUTES.login)
  }

  if (state.kind === "ready") {
    redirect(APP_ROUTES.dashboard)
  }

  if (state.kind === "inactive") {
    return (
      <AccessDenied
        title="Account disabled"
        description="This staff account is inactive. Ask an owner or admin to restore access."
        showSignOut
      />
    )
  }

  return (
    <div className="grid min-h-svh lg:grid-cols-[1fr_1.1fr]">
      <aside className="relative hidden bg-sidebar text-sidebar-foreground lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg brand-accent">
            <Smartphone className="size-5" />
          </div>
          <div>
            <p className="text-sm font-medium">MobilePOS</p>
            <p className="text-xs text-sidebar-foreground/60">First counter setup</p>
          </div>
        </div>
        <div className="max-w-md space-y-3">
          <h1 className="font-heading text-4xl leading-tight tracking-tight">
            Open the shop before the first ticket.
          </h1>
          <p className="text-sm leading-6 text-sidebar-foreground/70">
            We create the organization and main shop on the server. Your browser
            cannot assign itself Owner.
          </p>
        </div>
        <p className="text-xs text-sidebar-foreground/40">Owner bootstrap only</p>
      </aside>
      <main className="flex items-center justify-center bg-background p-6 sm:p-10">
        <div className="w-full max-w-md space-y-8">
          <div className="space-y-2">
            <h1 className="font-heading text-2xl tracking-tight">Set up your shop</h1>
            <p className="text-sm text-muted-foreground">
              This is only for a new account that does not belong to a shop yet.
              Invited staff skip this step.
            </p>
          </div>
          <OnboardingForm />
        </div>
      </main>
    </div>
  )
}

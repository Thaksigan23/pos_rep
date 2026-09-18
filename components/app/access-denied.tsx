import Link from "next/link"
import { ShieldOff } from "lucide-react"

import { LogoutButton } from "@/features/auth/components/logout-button"
import { buttonVariants } from "@/components/ui/button"
import { APP_ROUTES } from "@/lib/navigation/paths"
import { cn } from "@/lib/utils"

export function AccessDenied({
  title = "Access denied",
  description = "Your role cannot open this section. Ask an owner or admin if you need access.",
  showSignOut = false,
}: {
  title?: string
  description?: string
  showSignOut?: boolean
}) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-6 py-16 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-foreground text-background">
        <ShieldOff className="size-6" />
      </div>
      <p className="mt-5 text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
        403
      </p>
      <h1 className="mt-2 font-heading text-3xl tracking-tight">{title}</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href={APP_ROUTES.dashboard}
          className={cn(buttonVariants({ size: "lg" }), "h-11 px-4")}
        >
          Go to dashboard
        </Link>
        {showSignOut ? <LogoutButton /> : null}
      </div>
    </div>
  )
}

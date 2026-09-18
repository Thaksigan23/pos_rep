import Link from "next/link"
import { SearchX } from "lucide-react"

import { buttonVariants } from "@/components/ui/button"
import { APP_ROUTES } from "@/lib/navigation/paths"
import { cn } from "@/lib/utils"

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center px-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-foreground text-background">
        <SearchX className="size-6" />
      </div>
      <p className="mt-5 text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
        404
      </p>
      <h1 className="mt-2 font-heading text-3xl tracking-tight">Page not found</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        That screen is not part of the counter. Head back to the dashboard.
      </p>
      <Link
        href={APP_ROUTES.dashboard}
        className={cn(buttonVariants({ size: "lg" }), "mt-8 h-11 px-4")}
      >
        Go to dashboard
      </Link>
    </div>
  )
}

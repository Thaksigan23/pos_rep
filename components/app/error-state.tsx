"use client"

import Link from "next/link"
import { AlertTriangle } from "lucide-react"

import { Button, buttonVariants } from "@/components/ui/button"
import { APP_ROUTES } from "@/lib/navigation/paths"
import { cn } from "@/lib/utils"

export function ErrorState({
  title = "Something went wrong",
  description = "The counter could not load this screen. Try again.",
  retry,
}: {
  title?: string
  description?: string
  retry?: () => void
}) {
  return (
    <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border bg-card px-6 py-16 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
        <AlertTriangle className="size-6" />
      </div>
      <h2 className="mt-5 font-heading text-xl tracking-tight">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
        {description}
      </p>
      <div className="mt-6 flex gap-3">
        {retry ? (
          <Button type="button" className="h-11 px-4" onClick={retry}>
            Try again
          </Button>
        ) : null}
        <Link
          href={APP_ROUTES.dashboard}
          className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 px-4")}
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  )
}

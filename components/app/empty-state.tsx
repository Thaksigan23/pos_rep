import type { LucideIcon } from "lucide-react"
import Link from "next/link"

import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon
  title: string
  description: string
  action?: { label: string; href?: string; onClick?: () => void; disabled?: boolean }
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed bg-card px-6 py-10 text-center",
        className
      )}
    >
      <div className="flex size-11 items-center justify-center rounded-xl bg-foreground text-background">
        <Icon className="size-5" />
      </div>
      <h2 className="mt-4 font-heading text-lg tracking-tight">{title}</h2>
      <p className="mt-1.5 max-w-md text-sm leading-6 text-muted-foreground">
        {description}
      </p>
      {action?.href ? (
        <Link
          href={action.href}
          className={cn(buttonVariants(), "btn-h mt-5 h-10 px-4")}
        >
          {action.label}
        </Link>
      ) : action ? (
        <Button
          type="button"
          className="btn-h mt-5 h-10 px-4"
          disabled={action.disabled}
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      ) : null}
    </div>
  )
}

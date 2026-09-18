import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"

import { StatusBadge, type StatusTone } from "@/components/app/status-badge"

export function PageHeader({
  eyebrow,
  title,
  description,
  icon: Icon,
  actions,
  badge,
}: {
  eyebrow?: string
  title: string
  description?: string
  icon?: LucideIcon
  actions?: ReactNode
  badge?: { label: string; tone?: StatusTone }
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
            {eyebrow}
          </p>
        ) : null}
        <div className="mt-1 flex items-center gap-3">
          {Icon ? (
            <div className="hidden size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground sm:flex">
              <Icon className="size-5" />
            </div>
          ) : null}
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-heading text-2xl tracking-tight md:text-3xl">
                {title}
              </h1>
              {badge ? (
                <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
              ) : null}
            </div>
            {description ? (
              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  )
}

import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

const toneClass = {
  ready: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
  wait: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  stop: "bg-destructive/10 text-destructive",
  info: "bg-sky-500/15 text-sky-800 dark:text-sky-300",
  neutral: "bg-muted text-muted-foreground",
} as const

export type StatusTone = keyof typeof toneClass

export function StatusBadge({
  children,
  tone = "neutral",
  icon: Icon,
  className,
}: {
  children: string
  tone?: StatusTone
  icon?: LucideIcon
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-medium",
        toneClass[tone],
        className
      )}
    >
      {Icon ? <Icon className="size-3" /> : null}
      {children}
    </span>
  )
}

"use client"

import { useState } from "react"
import { Smartphone } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Shop / product mark for the app shell.
 * Prefer signed logo URL; fall back to the MobilePOS phone icon on miss/error.
 */
export function ShopBrandMark({
  logoUrl,
  alt,
  className,
  iconClassName,
}: {
  logoUrl?: string | null
  alt: string
  className?: string
  iconClassName?: string
}) {
  const [failed, setFailed] = useState(false)
  const showLogo = Boolean(logoUrl) && !failed

  return (
    <div
      className={cn(
        "flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg brand-accent",
        className
      )}
    >
      {showLogo ? (
        // eslint-disable-next-line @next/next/no-img-element -- private signed URL
        <img
          src={logoUrl!}
          alt={alt}
          className="size-full object-contain bg-background p-0.5"
          onError={() => setFailed(true)}
        />
      ) : (
        <Smartphone className={cn("size-4", iconClassName)} aria-hidden />
      )}
    </div>
  )
}

import { Package } from "lucide-react"

import { cn } from "@/lib/utils"

export function ProductThumbnail({
  src,
  alt,
  size = "md",
  className,
  priority = false,
}: {
  src?: string | null
  alt: string
  size?: "sm" | "md" | "lg" | "pos" | "catalog" | "inventory" | "fill"
  className?: string
  /** Skip lazy-load for above-the-fold primary images. */
  priority?: boolean
}) {
  const dim =
    size === "sm"
      ? "size-9"
      : size === "catalog"
        ? "size-11"
        : size === "inventory"
          ? "size-10"
          : size === "pos"
            ? "size-[3.5rem]"
            : size === "fill"
              ? "size-full"
              : size === "lg"
                ? "size-40"
                : "size-12"

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-border/70 bg-neutral-50",
        size === "fill" ? "min-h-0 min-w-0" : "shrink-0",
        dim,
        className
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          className="size-full object-contain p-0.5"
        />
      ) : (
        <div
          className="flex size-full items-center justify-center bg-gradient-to-b from-neutral-50 to-neutral-100 text-muted-foreground"
          role="img"
          aria-label={alt || "No product image"}
        >
          <Package
            className={
              size === "sm" || size === "inventory"
                ? "size-3.5"
                : size === "lg"
                  ? "size-8"
                  : "size-5"
            }
          />
        </div>
      )}
    </div>
  )
}

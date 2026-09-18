"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { ImagePlus, Star, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  deleteProductImageAction,
  setPrimaryProductImageAction,
  uploadProductImageAction,
} from "@/features/products/image-actions"
import { ProductThumbnail } from "@/features/products/components/product-thumbnail"
import { cn } from "@/lib/utils"

type ImageRow = {
  id: string
  storage_path: string
  sort_order: number
  is_primary: boolean
  url: string | null
}

export function ProductImagesPanel({
  productId,
  images,
  canManage,
  productName,
}: {
  productId: string
  images: ImageRow[]
  canManage: boolean
  productName?: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [uploading, setUploading] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const primary = images.find((i) => i.is_primary) ?? images[0]
  const active =
    images.find((i) => i.id === selectedId) ?? primary ?? null
  const label = productName ? `${productName} photo` : "Product photo"

  async function onUpload(file: File | null) {
    if (!file) return
    setUploading(true)
    const fd = new FormData()
    fd.set("productId", productId)
    fd.set("file", file)
    const result = await uploadProductImageAction(fd)
    setUploading(false)
    if ("error" in result) {
      toast.error(result.error)
      return
    }
    toast.success(result.success)
    router.refresh()
  }

  return (
    <section className="panel panel-pad space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-lg">Images</h2>
          <p className="text-sm text-muted-foreground">
            Up to 5 catalog photos. Primary appears in lists and POS.
          </p>
        </div>
        {canManage ? (
          <label className="inline-flex">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/svg+xml"
              className="sr-only"
              disabled={uploading || pending || images.length >= 5}
              aria-label="Upload product image"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null
                e.target.value = ""
                void onUpload(file)
              }}
            />
            <span
              className={cn(
                "inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm font-medium hover:bg-muted",
                (uploading || images.length >= 5) &&
                  "pointer-events-none opacity-50"
              )}
            >
              <ImagePlus className="size-4" aria-hidden />
              {uploading ? "Uploading…" : "Upload"}
            </span>
          </label>
        ) : null}
      </div>

      {images.length === 0 ? (
        <div className="flex items-center gap-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          <ProductThumbnail alt={label} size="md" />
          No images yet.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,18rem)_1fr]">
          <ProductThumbnail
            src={active?.url}
            alt={label}
            size="lg"
            priority
            className="aspect-square size-full max-w-sm rounded-xl bg-neutral-50"
          />
          <div className="space-y-3">
            <ul className="flex flex-wrap gap-2">
              {images.map((img, index) => (
                <li key={img.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(img.id)}
                    className={cn(
                      "rounded-lg outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring",
                      (active?.id === img.id ||
                        (!selectedId && img.is_primary)) &&
                        "ring-2 ring-primary"
                    )}
                    aria-label={`Show image ${index + 1}${
                      img.is_primary ? ", primary" : ""
                    }`}
                    aria-pressed={active?.id === img.id}
                  >
                    <ProductThumbnail
                      src={img.url}
                      alt=""
                      size="inventory"
                      className="rounded-md bg-neutral-50"
                    />
                  </button>
                </li>
              ))}
            </ul>

            {active && canManage ? (
              <div className="flex flex-wrap gap-2">
                {!active.is_primary ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    aria-label="Set as primary image"
                    onClick={() =>
                      startTransition(async () => {
                        const result = await setPrimaryProductImageAction(
                          active.id,
                          productId
                        )
                        if ("error" in result) toast.error(result.error)
                        else {
                          toast.success(result.success)
                          router.refresh()
                        }
                      })
                    }
                  >
                    <Star className="size-3.5" aria-hidden />
                    Set primary
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    This is the primary catalog image.
                  </p>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  aria-label="Delete selected image"
                  onClick={() =>
                    startTransition(async () => {
                      const result = await deleteProductImageAction(
                        active.id,
                        productId
                      )
                      if ("error" in result) toast.error(result.error)
                      else {
                        toast.success(result.success)
                        setSelectedId(null)
                        router.refresh()
                      }
                    })
                  }
                >
                  <Trash2 className="size-3.5" aria-hidden />
                  Delete
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </section>
  )
}

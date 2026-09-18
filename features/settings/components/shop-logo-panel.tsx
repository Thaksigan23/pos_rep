"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { ImagePlus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  removeShopLogoAction,
  uploadShopLogoAction,
} from "@/features/products/image-actions"

export function ShopLogoPanel({
  logoUrl,
}: {
  logoUrl: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [uploading, setUploading] = useState(false)

  return (
    <section className="panel panel-pad space-y-3">
      <div>
        <p className="section-label">Shop logo</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Optional. Used on receipts and settings preview. Keep it simple for
          thermal printers.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex size-20 items-center justify-center overflow-hidden rounded-xl border bg-muted/40">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt="Shop logo"
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <span className="text-xs text-muted-foreground">No logo</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/svg+xml"
              className="sr-only"
              disabled={uploading || pending}
              onChange={async (e) => {
                const file = e.target.files?.[0]
                e.target.value = ""
                if (!file) return
                setUploading(true)
                const fd = new FormData()
                fd.set("file", file)
                const result = await uploadShopLogoAction(fd)
                setUploading(false)
                if ("error" in result) toast.error(result.error)
                else {
                  toast.success(result.success)
                  router.refresh()
                }
              }}
            />
            <span className="btn-h inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm font-medium hover:bg-muted">
              <ImagePlus className="size-4" />
              {uploading ? "Uploading…" : logoUrl ? "Replace" : "Upload"}
            </span>
          </label>
          {logoUrl ? (
            <Button
              type="button"
              variant="outline"
              className="btn-h h-10"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await removeShopLogoAction()
                  if ("error" in result) toast.error(result.error)
                  else {
                    toast.success(result.success)
                    router.refresh()
                  }
                })
              }
            >
              <Trash2 className="size-4" />
              Remove
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  )
}

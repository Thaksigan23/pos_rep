"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import {
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Loader2,
  Trash2,
  X,
} from "lucide-react"

import {
  deleteRepairPhotoAction,
  uploadRepairPhotoAction,
} from "@/features/repairs/actions"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { displayCaption, formatDisplayDateTime } from "@/lib/datetime/format"
import { cn } from "@/lib/utils"

type Photo = {
  id: string
  caption: string | null
  created_at: string
}

export function RepairPhotosPanel({
  repairId,
  photos,
  photoUrls,
  canManage,
}: {
  repairId: string
  photos: Photo[]
  photoUrls: Record<string, string | null>
  canManage: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string>()
  const [success, setSuccess] = useState<string>()
  const [caption, setCaption] = useState("")
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const viewable = photos.filter((p) => photoUrls[p.id])
  const active =
    viewerIndex != null && viewerIndex >= 0 && viewerIndex < viewable.length
      ? viewable[viewerIndex]
      : null

  function stepViewer(delta: -1 | 1) {
    setViewerIndex((i) => {
      if (i == null) return i
      const next = i + delta
      if (next < 0 || next >= viewable.length) return i
      return next
    })
  }

  useEffect(() => {
    if (viewerIndex == null || viewable.length <= 1) return
    function onKey(e: KeyboardEvent) {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return
      e.preventDefault()
      e.stopPropagation()
      stepViewer(e.key === "ArrowLeft" ? -1 : 1)
    }
    // Capture before dialog focus-trap / composite arrow handling.
    document.addEventListener("keydown", onKey, true)
    return () => document.removeEventListener("keydown", onKey, true)
  }, [viewerIndex, viewable.length])

  function upload() {
    const file = fileRef.current?.files?.[0]
    if (!file) {
      setError("Choose an image file.")
      return
    }
    setError(undefined)
    setSuccess(undefined)
    const fd = new FormData()
    fd.set("repairId", repairId)
    fd.set("caption", caption)
    fd.set("file", file)
    startTransition(async () => {
      const result = await uploadRepairPhotoAction(fd)
      if ("error" in result) setError(result.error)
      else if ("success" in result) {
        setSuccess(result.success)
        setCaption("")
        if (fileRef.current) fileRef.current.value = ""
      }
    })
  }

  function remove(photoId: string) {
    setError(undefined)
    setSuccess(undefined)
    startTransition(async () => {
      const result = await deleteRepairPhotoAction(photoId, repairId)
      if ("error" in result) setError(result.error)
      else if ("success" in result) {
        setSuccess(result.success)
        setViewerIndex(null)
      }
    })
  }

  function openViewer(photoId: string) {
    const idx = viewable.findIndex((p) => p.id === photoId)
    if (idx >= 0) setViewerIndex(idx)
  }

  return (
    <div className="space-y-4">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {success ? (
        <Alert>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      ) : null}

      {canManage ? (
        <div className="rounded-xl border bg-background/60 p-4">
          <div className="mb-3">
            <p className="text-sm font-medium">Upload documentation photo</p>
            <p className="text-xs text-muted-foreground">
              JPEG, PNG, WebP, or HEIC · max 10 MB
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <Input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                ref={fileRef}
                aria-label="Choose repair photo"
              />
              <Input
                placeholder="Caption (optional)"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                aria-label="Photo caption"
              />
            </div>
            <Button type="button" disabled={pending} onClick={upload}>
              {pending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <ImagePlus className="size-4" aria-hidden />
              )}
              {pending ? "Uploading…" : "Upload"}
            </Button>
          </div>
        </div>
      ) : null}

      {photos.length === 0 ? (
        <p className="text-sm text-muted-foreground">No photos yet.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {photos.map((photo) => {
            const url = photoUrls[photo.id]
            return (
              <li key={photo.id}>
                <figure className="overflow-hidden rounded-xl border bg-card">
                  <button
                    type="button"
                    className={cn(
                      "block w-full outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      !url && "cursor-default"
                    )}
                    onClick={() => url && openViewer(photo.id)}
                    disabled={!url}
                    aria-label={
                      photo.caption
                        ? `View photo: ${displayCaption(photo.caption)}`
                        : "View repair photo"
                    }
                  >
                    {url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={url}
                        alt={
                          displayCaption(
                            photo.caption,
                            "Repair documentation photo"
                          )
                        }
                        loading="lazy"
                        decoding="async"
                        className="aspect-[4/3] w-full bg-neutral-100 object-cover"
                      />
                    ) : (
                      <div className="flex aspect-[4/3] items-center justify-center bg-muted text-xs text-muted-foreground">
                        Unavailable
                      </div>
                    )}
                  </button>
                  <figcaption className="flex items-start justify-between gap-2 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {displayCaption(photo.caption, "No caption")}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {formatDisplayDateTime(photo.created_at)}
                      </p>
                    </div>
                    {canManage ? (
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => remove(photo.id)}
                        aria-label="Delete photo"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    ) : null}
                  </figcaption>
                </figure>
              </li>
            )
          })}
        </ul>
      )}

      <Dialog
        open={active != null}
        onOpenChange={(open) => {
          if (!open) setViewerIndex(null)
        }}
      >
        <DialogContent
          className="max-h-[90vh] overflow-auto sm:max-w-3xl"
          showCloseButton={false}
        >
          <DialogHeader className="pr-10">
            <DialogTitle>
              {displayCaption(active?.caption, "Repair photo")}
            </DialogTitle>
            <DialogDescription>
              {active ? formatDisplayDateTime(active.created_at) : null}
            </DialogDescription>
          </DialogHeader>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="absolute top-2 right-2"
            aria-label="Close photo preview"
            onClick={() => setViewerIndex(null)}
          >
            <X className="size-4" />
          </Button>
          {active && photoUrls[active.id] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrls[active.id]!}
              alt={displayCaption(active.caption, "Repair documentation photo")}
              className="max-h-[70vh] w-full rounded-lg bg-neutral-100 object-contain"
            />
          ) : null}
          {viewable.length > 1 ? (
            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label="Previous photo"
                disabled={viewerIndex === 0}
                onClick={() => stepViewer(-1)}
              >
                <ChevronLeft className="size-4" />
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                {(viewerIndex ?? 0) + 1} / {viewable.length}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label="Next photo"
                disabled={viewerIndex === viewable.length - 1}
                onClick={() => stepViewer(1)}
              >
                Next
                <ChevronRight className="size-4" />
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

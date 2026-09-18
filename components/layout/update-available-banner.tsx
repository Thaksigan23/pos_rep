"use client"

import { useCallback, useEffect, useState } from "react"
import { RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { getAppBuildId } from "@/lib/app-build"

const POLL_MS = 60_000
const STORAGE_DISMISS_KEY = "mobilepos:dismissed-build-id"

export function UpdateAvailableBanner() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [serverBuildId, setServerBuildId] = useState<string | null>(null)
  const clientBuildId = getAppBuildId()

  const checkVersion = useCallback(async () => {
    try {
      const res = await fetch(`/api/version?t=${Date.now()}`, {
        cache: "no-store",
      })
      if (!res.ok) return
      const data = (await res.json()) as { buildId?: string }
      const nextId = data.buildId?.trim()
      if (!nextId || nextId === "dev") return
      if (nextId === clientBuildId) {
        setUpdateAvailable(false)
        return
      }
      const dismissed =
        typeof window !== "undefined"
          ? window.sessionStorage.getItem(STORAGE_DISMISS_KEY)
          : null
      if (dismissed === nextId) return
      setServerBuildId(nextId)
      setUpdateAvailable(true)
    } catch {
      // Ignore network errors while offline / mid-deploy.
    }
  }, [clientBuildId])

  useEffect(() => {
    void checkVersion()
    const id = window.setInterval(() => {
      void checkVersion()
    }, POLL_MS)

    const onFocus = () => {
      void checkVersion()
    }
    const onVisible = () => {
      if (document.visibilityState === "visible") void checkVersion()
    }

    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onVisible)

    return () => {
      window.clearInterval(id)
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [checkVersion])

  if (!updateAvailable) return null

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center p-3 pointer-events-none sm:bottom-4 sm:justify-end sm:p-0 sm:pr-4"
    >
      <div className="pointer-events-auto flex max-w-md items-center gap-3 rounded-lg border border-primary/30 bg-background px-3 py-2.5 shadow-none">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Update available</p>
          <p className="text-xs text-muted-foreground">
            A newer version is ready. Refresh to load it.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8"
            onClick={() => {
              if (serverBuildId) {
                window.sessionStorage.setItem(STORAGE_DISMISS_KEY, serverBuildId)
              }
              setUpdateAvailable(false)
            }}
          >
            Later
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-8"
            onClick={() => {
              window.location.reload()
            }}
          >
            <RefreshCw className="size-3.5" aria-hidden />
            Refresh
          </Button>
        </div>
      </div>
    </div>
  )
}

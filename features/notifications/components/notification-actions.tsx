"use client"

import { useTransition } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import {
  markAllReadAction,
  markNotificationReadAction,
} from "@/features/notifications/actions"
import { Button } from "@/components/ui/button"

export function MarkNotificationReadButton({
  notificationId,
}: {
  notificationId: string
}) {
  const [pending, startTransition] = useTransition()

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="btn-h h-8 shrink-0 text-xs"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          const result = await markNotificationReadAction(notificationId)
          if ("error" in result) toast.error(result.error)
        })
      }}
    >
      {pending ? <Loader2 className="size-3 animate-spin" /> : null}
      Mark read
    </Button>
  )
}

export function MarkAllReadButton() {
  const [pending, startTransition] = useTransition()

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="btn-h h-9"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          const result = await markAllReadAction()
          if ("error" in result) {
            toast.error(result.error)
            return
          }
          toast.success(result.success)
        })
      }}
    >
      {pending ? <Loader2 className="size-3 animate-spin" /> : null}
      Mark all read
    </Button>
  )
}

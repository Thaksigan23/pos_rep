"use client"

import { useState, useTransition } from "react"
import { Loader2 } from "lucide-react"

import { changeRepairStatusAction, cancelRepairAction } from "@/features/repairs/actions"
import {
  allowedTransitions,
  REPAIR_STATUS_LABELS,
  type RepairStatus,
} from "@/lib/repairs/constants"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

export function RepairStatusActions({
  repairId,
  status,
  canCancel,
}: {
  repairId: string
  status: RepairStatus
  canCancel: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [note, setNote] = useState("")
  const [cancelReason, setCancelReason] = useState("")
  const [message, setMessage] = useState<string>()
  const [error, setError] = useState<string>()
  const next = allowedTransitions(status)

  function runStatus(nextStatus: RepairStatus) {
    setError(undefined)
    setMessage(undefined)
    startTransition(async () => {
      const result = await changeRepairStatusAction({
        repairId,
        status: nextStatus,
        note: note || undefined,
      })
      if ("error" in result) setError(result.error)
      else if ("success" in result) {
        setMessage(result.success)
        setNote("")
      }
    })
  }

  function runCancel() {
    setError(undefined)
    setMessage(undefined)
    startTransition(async () => {
      const result = await cancelRepairAction({
        repairId,
        reason: cancelReason,
      })
      if ("error" in result) setError(result.error)
      else if ("success" in result) setMessage(result.success)
    })
  }

  return (
    <div className="space-y-4">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {message ? (
        <Alert>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}

      {next.length > 0 ? (
        <>
          <Textarea
            placeholder="Optional status note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
          />
          <div className="flex flex-wrap gap-2">
            {next.map((s) => (
              <Button
                key={s}
                type="button"
                disabled={pending}
                onClick={() => runStatus(s)}
              >
                {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                Move to {REPAIR_STATUS_LABELS[s]}
              </Button>
            ))}
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">No further status transitions.</p>
      )}

      {canCancel && status !== "cancelled" && status !== "delivered" ? (
        <div className="space-y-2 border-t pt-4">
          <p className="text-sm font-medium">Cancel repair</p>
          <p className="text-xs text-muted-foreground">
            Cancellation does not refund payments automatically.
          </p>
          <Textarea
            placeholder="Cancellation reason"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            rows={2}
          />
          <Button
            type="button"
            variant="destructive"
            disabled={pending || !cancelReason.trim()}
            onClick={runCancel}
          >
            Cancel job
          </Button>
        </div>
      ) : null}
    </div>
  )
}

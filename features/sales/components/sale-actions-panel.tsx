"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import {
  cancelSaleAction,
  voidSalePaymentAction,
} from "@/features/sales/actions"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import type { SaleStatus } from "@/lib/sales/constants"

export function SaleCancelPanel({
  saleId,
  status,
}: {
  saleId: string
  status: SaleStatus
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [reason, setReason] = useState("")
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string>()

  const canCancel =
    status === "held" ||
    status === "completed" ||
    status === "partially_refunded"

  if (!canCancel) return null

  function submit() {
    setError(undefined)
    startTransition(async () => {
      const result = await cancelSaleAction({ saleId, reason })
      setOpen(false)
      if ("error" in result) {
        setError(result.error)
        toast.error(result.error)
        return
      }
      toast.success(result.success)
      router.refresh()
    })
  }

  return (
    <div className="space-y-3 rounded-2xl border p-4">
      <h3 className="font-heading text-base">Cancel sale</h3>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Field>
        <FieldLabel htmlFor="cancel-reason">Reason</FieldLabel>
        <Input
          id="cancel-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Required"
        />
      </Field>
      <Button
        type="button"
        variant="destructive"
        disabled={pending || !reason.trim()}
        onClick={() => setOpen(true)}
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        Cancel sale
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Cancel this sale?"
        description="This cannot be undone. Stock may be restored for completed sales."
        confirmLabel="Cancel sale"
        destructive
        pending={pending}
        onConfirm={submit}
      />
    </div>
  )
}

export function VoidPaymentButton({
  paymentId,
  saleId,
}: {
  paymentId: string
  saleId: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)

  function submit() {
    const reason = window.prompt("Reason for voiding this payment?")
    if (!reason?.trim()) {
      setOpen(false)
      return
    }
    startTransition(async () => {
      const result = await voidSalePaymentAction({
        paymentId,
        saleId,
        reason: reason.trim(),
      })
      setOpen(false)
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success(result.success)
      router.refresh()
    })
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => setOpen(true)}
      >
        Void
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Void payment?"
        description="Owner/admin only. Enter a reason in the next prompt."
        confirmLabel="Continue"
        destructive
        pending={pending}
        onConfirm={submit}
      />
    </>
  )
}

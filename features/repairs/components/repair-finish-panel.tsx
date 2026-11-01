"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { Loader2 } from "lucide-react"

import { cancelRepairAction, finishRepairAction } from "@/features/repairs/actions"
import { formatCurrency } from "@/lib/money/currency"
import { repairPrintPath } from "@/lib/navigation/feature-paths"
import {
  PAYMENT_METHOD_LABELS,
  type PaymentMethod,
  type RepairStatus,
} from "@/lib/repairs/constants"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button, buttonVariants } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

export function RepairFinishPanel({
  repairId,
  status,
  quotedTotal,
  paidTotal,
  workDone,
  canCancel,
  canTakePayment,
  currencyCode,
  currencyLocale,
}: {
  repairId: string
  status: RepairStatus
  quotedTotal: number
  paidTotal: number
  workDone: string | null
  canCancel: boolean
  canTakePayment: boolean
  currencyCode: string
  currencyLocale: string
}) {
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState(workDone ?? "")
  const [price, setPrice] = useState(
    quotedTotal > 0 ? String(quotedTotal) : ""
  )
  const [collect, setCollect] = useState(canTakePayment)
  const [method, setMethod] = useState<PaymentMethod>("cash")
  const [cancelReason, setCancelReason] = useState("")
  const [message, setMessage] = useState<string>()
  const [error, setError] = useState<string>()

  const money = (n: number) => formatCurrency(n, currencyCode, currencyLocale)
  const priceNumber = Number(price)
  const due =
    Number.isFinite(priceNumber) ? Math.max(0, priceNumber - paidTotal) : 0
  const finished = status === "completed" || status === "delivered"
  const printHref = repairPrintPath(repairId)

  function finish() {
    setError(undefined)
    setMessage(undefined)
    if (!Number.isFinite(priceNumber) || priceNumber < 0) {
      setError("Enter the final price.")
      return
    }
    startTransition(async () => {
      const result = await finishRepairAction({
        repairId,
        workDone: note,
        finalPrice: priceNumber,
        collectPayment: collect && due > 0,
        method,
      })
      if ("error" in result && result.error) setError(result.error)
      else if ("success" in result && result.success) {
        setMessage(result.success)
        setOpen(false)
      }
    })
  }

  function cancel() {
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

      <div className="flex flex-wrap gap-2">
        <Link
          href={printHref}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "btn-h")}
        >
          Print receipt and sticker
        </Link>
      </div>

      {finished ? (
        <div className="space-y-2 text-sm">
          <p className="font-medium">This repair is finished.</p>
          {workDone ? (
            <p className="whitespace-pre-wrap text-muted-foreground">{workDone}</p>
          ) : (
            <p className="text-muted-foreground">No work note was saved.</p>
          )}
        </div>
      ) : status === "cancelled" ? (
        <p className="text-sm text-muted-foreground">This repair was cancelled.</p>
      ) : !open ? (
        <Button type="button" onClick={() => setOpen(true)}>
          Completed
        </Button>
      ) : (
        <div className="space-y-3 rounded-xl border bg-background/60 p-4">
          <p className="text-sm font-medium">What was done</p>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Screen replaced, charged, tested…"
          />
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">
              Final price ({currencyCode})
            </span>
            <input
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="h-10 w-full max-w-xs rounded-lg border border-input bg-background px-3 text-sm"
            />
          </label>
          {paidTotal > 0 ? (
            <p className="text-xs text-muted-foreground">
              Already paid {money(paidTotal)}.
            </p>
          ) : null}
          {canTakePayment ? (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={collect}
                onChange={(e) => setCollect(e.target.checked)}
              />
              Take payment now
              {collect && due > 0 ? ` · ${money(due)}` : ""}
            </label>
          ) : (
            <p className="text-xs text-muted-foreground">
              A cashier can take the payment after this is saved.
            </p>
          )}
          {canTakePayment && collect && due > 0 ? (
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">Payment</span>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                className="h-10 w-full max-w-xs rounded-lg border border-input bg-background px-3 text-sm"
              >
                {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map(
                  (item) => (
                    <option key={item} value={item}>
                      {PAYMENT_METHOD_LABELS[item]}
                    </option>
                  )
                )}
              </select>
            </label>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={pending} onClick={finish}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Save and finish
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Back
            </Button>
          </div>
        </div>
      )}

      {canCancel && status !== "cancelled" && status !== "delivered" && status !== "completed" ? (
        <div className="space-y-2 border-t pt-4">
          <p className="text-sm font-medium">Cancel repair</p>
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
            onClick={cancel}
          >
            Cancel job
          </Button>
        </div>
      ) : null}
    </div>
  )
}

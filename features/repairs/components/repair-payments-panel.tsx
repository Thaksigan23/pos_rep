"use client"

import { useState, useTransition } from "react"
import { Loader2 } from "lucide-react"

import { recordRepairPaymentAction } from "@/features/repairs/actions"
import { formatCurrency } from "@/lib/money/currency"
import {
  PAYMENT_METHOD_LABELS,
  type PaymentMethod,
} from "@/lib/repairs/constants"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldLabel } from "@/components/ui/field"

type PaymentRow = {
  id: string
  amount: number
  method: PaymentMethod
  notes: string | null
  created_at: string
  voided_at: string | null
  tendered_amount: number | null
  change_amount: number
  entry_type: string
}

export function RepairPaymentsPanel({
  repairId,
  outstanding,
  payableTotal,
  paidTotal,
  payments,
  currencyCode,
  currencyLocale,
  canTakePayments,
}: {
  repairId: string
  outstanding: number
  payableTotal: number
  paidTotal: number
  payments: PaymentRow[]
  currencyCode: string
  currencyLocale: string
  canTakePayments: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [method, setMethod] = useState<PaymentMethod>("cash")
  const [amount, setAmount] = useState("")
  const [tendered, setTendered] = useState("")
  const [notes, setNotes] = useState("")
  const [error, setError] = useState<string>()
  const [success, setSuccess] = useState<string>()

  function submit() {
    setError(undefined)
    setSuccess(undefined)
    startTransition(async () => {
      const result = await recordRepairPaymentAction({
        repairId,
        method,
        amount: method === "cash" ? undefined : Number(amount),
        tenderedAmount: method === "cash" ? Number(tendered) : undefined,
        notes: notes || undefined,
        idempotencyKey: crypto.randomUUID(),
      })
      if ("error" in result) setError(result.error)
      else if ("success" in result) {
        setSuccess(result.success)
        setAmount("")
        setTendered("")
        setNotes("")
      }
    })
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-background/60 px-4 py-3 text-sm">
          <p className="text-xs text-muted-foreground">Repair total</p>
          <p className="font-heading text-xl tabular-nums">
            {formatCurrency(payableTotal, currencyCode, currencyLocale)}
          </p>
        </div>
        <div className="rounded-xl border bg-background/60 px-4 py-3 text-sm">
          <p className="text-xs text-muted-foreground">Paid</p>
          <p className="font-heading text-xl tabular-nums">
            {formatCurrency(paidTotal, currencyCode, currencyLocale)}
          </p>
        </div>
        <div className="rounded-xl border bg-background/60 px-4 py-3 text-sm">
          <p className="text-xs text-muted-foreground">Outstanding</p>
          <p className="font-heading text-xl tabular-nums">
            {formatCurrency(outstanding, currencyCode, currencyLocale)}
          </p>
        </div>
      </div>

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

      {canTakePayments && outstanding > 0 ? (
        <div className="space-y-3 rounded-xl border p-4">
          <Field>
            <FieldLabel htmlFor="method">Method</FieldLabel>
            <select
              id="method"
              className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
            >
              {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map(
                (m) => (
                  <option key={m} value={m}>
                    {PAYMENT_METHOD_LABELS[m]}
                  </option>
                )
              )}
            </select>
          </Field>
          {method === "cash" ? (
            <Field>
              <FieldLabel htmlFor="tendered">Cash tendered</FieldLabel>
              <Input
                id="tendered"
                inputMode="decimal"
                value={tendered}
                onChange={(e) => setTendered(e.target.value)}
                placeholder="Amount customer handed over"
              />
              <p className="text-xs text-muted-foreground">
                Payment recorded will be capped at the outstanding balance; change is
                calculated server-side.
              </p>
            </Field>
          ) : (
            <Field>
              <FieldLabel htmlFor="amount">Amount</FieldLabel>
              <Input
                id="amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor="notes">Notes</FieldLabel>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
          <Button type="button" disabled={pending} onClick={submit}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Record payment
          </Button>
        </div>
      ) : null}

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Payment history</h3>
        <ul className="space-y-2">
          {payments.length === 0 ? (
            <li className="text-sm text-muted-foreground">No payments yet.</li>
          ) : (
            payments.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium tabular-nums">
                    {formatCurrency(p.amount, currencyCode, currencyLocale)}
                    <span className="font-normal text-muted-foreground">
                      {" "}
                      · {PAYMENT_METHOD_LABELS[p.method]}
                    </span>
                    {p.voided_at ? (
                      <span className="text-destructive"> · Voided</span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(p.created_at).toLocaleString()} · {p.entry_type}
                    {p.tendered_amount != null
                      ? ` · tendered ${formatCurrency(p.tendered_amount, currencyCode, currencyLocale)} · change ${formatCurrency(p.change_amount, currencyCode, currencyLocale)}`
                      : ""}
                  </p>
                </div>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  )
}

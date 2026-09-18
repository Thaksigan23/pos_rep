"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import { refundSaleAction } from "@/features/sales/actions"
import { formatCurrency, roundMoney } from "@/lib/money/currency"
import { salePath } from "@/lib/navigation/feature-paths"
import {
  PAYMENT_METHOD_LABELS,
  type PaymentMethod,
} from "@/lib/sales/constants"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

type RestockDisposition = "restock" | "damaged" | "none"

const DISPOSITION_LABELS: Record<RestockDisposition, string> = {
  restock: "Restock",
  damaged: "Damaged",
  none: "No restock",
}

type RefundableItem = {
  id: string
  description: string
  quantity: number
  refundedQty: number
  lineTotal: number
}

export function SaleRefundForm({
  saleId,
  items,
  currencyCode,
  currencyLocale,
}: {
  saleId: string
  items: RefundableItem[]
  currencyCode: string
  currencyLocale: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [reason, setReason] = useState("")
  const [method, setMethod] = useState<PaymentMethod>("cash")
  const [qtys, setQtys] = useState<Record<string, string>>({})
  const [dispositions, setDispositions] = useState<
    Record<string, RestockDisposition>
  >({})
  const [error, setError] = useState<string>()

  const preview = useMemo(() => {
    let total = 0
    const selected: {
      saleItemId: string
      quantity: number
      restockDisposition: RestockDisposition
    }[] = []
    for (const item of items) {
      const remaining = item.quantity - item.refundedQty
      const qty = Number(qtys[item.id] ?? 0)
      if (!Number.isFinite(qty) || qty <= 0) continue
      if (qty > remaining) continue
      const amount = roundMoney(item.lineTotal * (qty / item.quantity))
      total = roundMoney(total + amount)
      selected.push({
        saleItemId: item.id,
        quantity: qty,
        restockDisposition: dispositions[item.id] ?? "restock",
      })
    }
    return { total, selected }
  }, [items, qtys, dispositions])

  function submit() {
    setError(undefined)
    if (!reason.trim()) {
      setError("A refund reason is required.")
      return
    }
    if (preview.selected.length === 0) {
      setError("Select at least one item quantity to refund.")
      return
    }
    startTransition(async () => {
      const result = await refundSaleAction({
        saleId,
        reason: reason.trim(),
        method,
        items: preview.selected,
        idempotencyKey: crypto.randomUUID(),
      })
      if ("error" in result) {
        setError(result.error)
        toast.error(result.error)
        return
      }
      toast.success(result.success)
      router.push(salePath(saleId))
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="overflow-hidden rounded-2xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Item</th>
              <th className="px-3 py-2 font-medium">Sold</th>
              <th className="px-3 py-2 font-medium">Already refunded</th>
              <th className="px-3 py-2 font-medium">Refund qty</th>
              <th className="px-3 py-2 font-medium">Disposition</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const remaining = item.quantity - item.refundedQty
              return (
                <tr key={item.id} className="border-t">
                  <td className="px-3 py-2">
                    <p className="font-medium">{item.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(item.lineTotal, currencyCode, currencyLocale)}
                    </p>
                  </td>
                  <td className="px-3 py-2">{item.quantity}</td>
                  <td className="px-3 py-2">{item.refundedQty}</td>
                  <td className="px-3 py-2">
                    <Input
                      className="h-9 w-24"
                      inputMode="decimal"
                      disabled={remaining <= 0}
                      placeholder={remaining > 0 ? `0–${remaining}` : "—"}
                      value={qtys[item.id] ?? ""}
                      onChange={(e) =>
                        setQtys((prev) => ({
                          ...prev,
                          [item.id]: e.target.value,
                        }))
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      className="h-9 w-full min-w-28 rounded-lg border border-input bg-background px-2 text-sm"
                      disabled={remaining <= 0}
                      value={dispositions[item.id] ?? "restock"}
                      onChange={(e) =>
                        setDispositions((prev) => ({
                          ...prev,
                          [item.id]: e.target.value as RestockDisposition,
                        }))
                      }
                    >
                      {(
                        Object.keys(DISPOSITION_LABELS) as RestockDisposition[]
                      ).map((d) => (
                        <option key={d} value={d}>
                          {DISPOSITION_LABELS[d]}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <Field>
        <FieldLabel htmlFor="refund-method">Refund method</FieldLabel>
        <select
          id="refund-method"
          className="h-10 w-full max-w-xs rounded-lg border border-input bg-background px-3 text-sm"
          value={method}
          onChange={(e) => setMethod(e.target.value as PaymentMethod)}
        >
          {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => (
            <option key={m} value={m}>
              {PAYMENT_METHOD_LABELS[m]}
            </option>
          ))}
        </select>
      </Field>

      <Field>
        <FieldLabel htmlFor="refund-reason">Reason</FieldLabel>
        <Input
          id="refund-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Required"
        />
      </Field>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">
          Refund preview:{" "}
          <span className="font-medium">
            {formatCurrency(preview.total, currencyCode, currencyLocale)}
          </span>
        </p>
        <Button type="button" disabled={pending} onClick={submit}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          Process refund
        </Button>
      </div>
    </div>
  )
}

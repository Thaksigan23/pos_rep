"use client"

import { useState, useTransition } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import {
  receiveAllRemainingAction,
  receivePurchaseAction,
} from "@/features/purchases/actions"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type Item = {
  id: string
  quantity_ordered: number
  quantity_received: number
  productName: string
}

export function PurchaseReceivePanel({
  purchaseId,
  status,
  items,
}: {
  purchaseId: string
  status: string
  items: Item[]
}) {
  const [pending, startTransition] = useTransition()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [qtys, setQtys] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      items.map((i) => [
        i.id,
        String(Math.max(0, Number(i.quantity_ordered) - Number(i.quantity_received))),
      ])
    )
  )

  const canReceive =
    status === "ordered" || status === "partially_received"

  function receivePartial() {
    const payloadItems = items
      .map((item) => ({
        purchase_item_id: item.id,
        quantity: Number(qtys[item.id] || 0),
      }))
      .filter((i) => i.quantity > 0)

    if (payloadItems.length === 0) {
      toast.error("Enter at least one receive quantity.")
      return
    }

    startTransition(async () => {
      const result = await receivePurchaseAction({
        purchaseId,
        items: payloadItems,
      })
      if ("error" in result) toast.error(result.error)
      else toast.success(result.success)
    })
  }

  function receiveAll() {
    startTransition(async () => {
      setConfirmOpen(false)
      const result = await receiveAllRemainingAction(purchaseId)
      if ("error" in result) toast.error(result.error)
      else toast.success(result.success)
    })
  }

  if (!canReceive) {
    return (
      <p className="text-sm text-muted-foreground">
        This purchase cannot be received (status: {status}).
        {status === "received"
          ? " Double-receiving is blocked by the database."
          : ""}
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Partial receiving is supported by the database. Leave a quantity at 0 to
        skip that line for now.
      </p>
      <ul className="space-y-3">
        {items.map((item) => {
          const remaining =
            Number(item.quantity_ordered) - Number(item.quantity_received)
          return (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm"
            >
              <div>
                <p className="font-medium">{item.productName}</p>
                <p className="text-xs text-muted-foreground">
                  Ordered {item.quantity_ordered} · received {item.quantity_received} ·
                  remaining {remaining}
                </p>
              </div>
              <Input
                className="w-28"
                inputMode="decimal"
                disabled={remaining <= 0}
                value={qtys[item.id] ?? "0"}
                onChange={(e) =>
                  setQtys((prev) => ({ ...prev, [item.id]: e.target.value }))
                }
              />
            </li>
          )
        })}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={pending} onClick={receivePartial}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          Receive entered quantities
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => setConfirmOpen(true)}
        >
          Receive all remaining
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Receive all remaining?"
        description="This receives every outstanding line quantity into inventory via receive_purchase."
        confirmLabel="Receive all"
        pending={pending}
        onConfirm={receiveAll}
      />
    </div>
  )
}

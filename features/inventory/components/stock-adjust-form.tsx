"use client"

import { useState, useTransition } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import { adjustInventoryAction } from "@/features/inventory/actions"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { ADJUSTMENT_MOVEMENT_TYPES, MOVEMENT_TYPE_LABELS } from "@/lib/inventory/constants"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

type ProductOption = { id: string; name: string; sku: string }
type ShopOption = { id: string; name: string }

export function StockAdjustForm({
  products,
  shops,
  defaultShopId,
  defaultProductId,
}: {
  products: ProductOption[]
  shops: ShopOption[]
  defaultShopId: string
  defaultProductId?: string
}) {
  const [pending, startTransition] = useTransition()
  const [productId, setProductId] = useState(defaultProductId ?? "")
  const [shopId, setShopId] = useState(defaultShopId)
  const [qty, setQty] = useState("")
  const [movementType, setMovementType] =
    useState<(typeof ADJUSTMENT_MOVEMENT_TYPES)[number]>("adjustment")
  const [notes, setNotes] = useState("")
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [lastResult, setLastResult] = useState<string>()

  const quantityChange = Number(qty)
  const significant =
    Number.isFinite(quantityChange) && Math.abs(quantityChange) >= 20

  function submit() {
    startTransition(async () => {
      const result = await adjustInventoryAction({
        productId,
        shopId,
        quantityChange,
        movementType,
        notes,
      })
      setConfirmOpen(false)
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success(result.success)
      setLastResult(
        result.quantity != null
          ? `New stock quantity: ${result.quantity}`
          : result.success
      )
      setQty("")
      setNotes("")
    })
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!productId || !notes.trim() || !Number.isFinite(quantityChange) || quantityChange === 0) {
      toast.error("Product, non-zero quantity, and reason are required.")
      return
    }
    if (significant || quantityChange < 0) {
      setConfirmOpen(true)
      return
    }
    submit()
  }

  return (
    <>
      <form onSubmit={onSubmit} className="space-y-4">
        <Field>
          <FieldLabel htmlFor="productId">Product</FieldLabel>
          <select
            id="productId"
            className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
          >
            <option value="">Select product</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.sku})
              </option>
            ))}
          </select>
        </Field>
        <Field>
          <FieldLabel htmlFor="shopId">Shop</FieldLabel>
          <select
            id="shopId"
            className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
            value={shopId}
            onChange={(e) => setShopId(e.target.value)}
          >
            {shops.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field>
          <FieldLabel htmlFor="qty">Quantity change (+ add / − remove)</FieldLabel>
          <Input
            id="qty"
            inputMode="decimal"
            placeholder="e.g. 5 or -2"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="movementType">Type</FieldLabel>
          <select
            id="movementType"
            className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
            value={movementType}
            onChange={(e) =>
              setMovementType(
                e.target.value as (typeof ADJUSTMENT_MOVEMENT_TYPES)[number]
              )
            }
          >
            {ADJUSTMENT_MOVEMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {MOVEMENT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field>
          <FieldLabel htmlFor="notes">Reason / notes</FieldLabel>
          <Textarea
            id="notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            required
          />
        </Field>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          Apply adjustment
        </Button>
        {lastResult ? (
          <p className="text-sm text-muted-foreground">{lastResult}</p>
        ) : null}
      </form>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Confirm stock adjustment"
        description={`Apply quantity change of ${quantityChange}? Negative stock is rejected when the shop disallows it.`}
        confirmLabel="Adjust stock"
        destructive={quantityChange < 0}
        pending={pending}
        onConfirm={submit}
      />
    </>
  )
}

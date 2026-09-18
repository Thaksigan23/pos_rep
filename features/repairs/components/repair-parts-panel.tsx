"use client"

import { useState, useTransition } from "react"
import { Loader2 } from "lucide-react"

import { consumeRepairPartsAction } from "@/features/repairs/actions"
import { formatCurrency } from "@/lib/money/currency"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type Product = {
  id: string
  name: string
  sku: string
  product_stocks?: { quantity: number }[] | { quantity: number } | null
}

type PartRow = {
  id: string
  quantity_consumed: number
  unit_price: number
  products: { id: string; name: string; sku: string } | { id: string; name: string; sku: string }[] | null
  repair_part_costs?: { unit_cost: number } | { unit_cost: number }[] | null
}

export function RepairPartsPanel({
  repairId,
  parts,
  products,
  currencyCode,
  currencyLocale,
  canConsume,
  canViewCost,
}: {
  repairId: string
  parts: PartRow[]
  products: Product[]
  currencyCode: string
  currencyLocale: string
  canConsume: boolean
  canViewCost: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [productId, setProductId] = useState(products[0]?.id ?? "")
  const [qty, setQty] = useState("1")
  const [error, setError] = useState<string>()
  const [success, setSuccess] = useState<string>()

  function consume() {
    if (!productId) {
      setError("Select a product.")
      return
    }
    setError(undefined)
    setSuccess(undefined)
    startTransition(async () => {
      const result = await consumeRepairPartsAction({
        repairId,
        items: [{ product_id: productId, quantity: Number(qty) || 1 }],
      })
      if ("error" in result) setError(result.error)
      else if ("success" in result) setSuccess(result.success)
    })
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

      {canConsume ? (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border p-4">
          <select
            className="h-9 min-w-48 flex-1 rounded-lg border border-input bg-background px-3 text-sm"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
          >
            <option value="">Select part</option>
            {products.map((p) => {
              const stockRaw = p.product_stocks
              const stock = Array.isArray(stockRaw) ? stockRaw[0] : stockRaw
              return (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.sku}) · qty {stock?.quantity ?? 0}
                </option>
              )
            })}
          </select>
          <Input
            className="w-24"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="Qty"
          />
          <Button type="button" disabled={pending} onClick={consume}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Consume
          </Button>
        </div>
      ) : null}

      <ul className="space-y-2">
        {parts.length === 0 ? (
          <li className="text-sm text-muted-foreground">No parts consumed yet.</li>
        ) : (
          parts.map((part) => {
            const product = Array.isArray(part.products)
              ? part.products[0]
              : part.products
            const costRaw = part.repair_part_costs
            const cost = Array.isArray(costRaw) ? costRaw[0] : costRaw
            return (
              <li
                key={part.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium">{product?.name ?? "Part"}</p>
                  <p className="text-xs text-muted-foreground">
                    {product?.sku ? `SKU ${product.sku} · ` : ""}
                    Qty {part.quantity_consumed} consumed
                  </p>
                </div>
                <div className="text-right tabular-nums text-muted-foreground">
                  <p>
                    {formatCurrency(part.unit_price, currencyCode, currencyLocale)}
                  </p>
                  {canViewCost && cost ? (
                    <p className="text-xs">
                      cost{" "}
                      {formatCurrency(
                        cost.unit_cost,
                        currencyCode,
                        currencyLocale
                      )}
                    </p>
                  ) : null}
                </div>
              </li>
            )
          })
        )}
      </ul>
    </div>
  )
}

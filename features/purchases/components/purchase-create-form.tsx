"use client"

import { useMemo, useState, useTransition } from "react"
import { Loader2, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { createPurchaseAction } from "@/features/purchases/actions"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { formatCurrency } from "@/lib/money/currency"

type Supplier = { id: string; name: string }
type Shop = { id: string; name: string }
type Product = {
  id: string
  name: string
  sku: string
  barcode: string | null
}

type Line = {
  key: string
  product_id: string
  quantity_ordered: string
  unit_cost: string
}

export function PurchaseCreateForm({
  suppliers,
  shops,
  products,
  defaultShopId,
  currencyCode,
  currencyLocale,
}: {
  suppliers: Supplier[]
  shops: Shop[]
  products: Product[]
  defaultShopId: string
  currencyCode: string
  currencyLocale: string
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string>()
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "")
  const [shopId, setShopId] = useState(defaultShopId)
  const [notes, setNotes] = useState("")
  const [productQuery, setProductQuery] = useState("")
  const [lines, setLines] = useState<Line[]>([])

  const filteredProducts = useMemo(() => {
    const q = productQuery.trim().toLowerCase()
    if (!q) return products.slice(0, 30)
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          (p.barcode ?? "").toLowerCase().includes(q)
      )
      .slice(0, 30)
  }, [products, productQuery])

  const previewTotal = lines.reduce((sum, line) => {
    const qty = Number(line.quantity_ordered) || 0
    const cost = Number(line.unit_cost) || 0
    return sum + qty * cost
  }, 0)

  function addProduct(productId: string) {
    if (lines.some((l) => l.product_id === productId)) {
      toast.message("Product already on this purchase.")
      return
    }
    setLines((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        product_id: productId,
        quantity_ordered: "1",
        unit_cost: "0",
      },
    ])
    setProductQuery("")
  }

  function onBarcodeEnter(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return
    e.preventDefault()
    const code = productQuery.trim()
    if (!code) return
    const byBarcode = products.find((p) => p.barcode === code)
    const bySku = products.find((p) => p.sku.toLowerCase() === code.toLowerCase())
    const match = byBarcode ?? bySku ?? filteredProducts[0]
    if (match) addProduct(match.id)
    else toast.error("No product matched that barcode/SKU.")
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(undefined)
    if (!supplierId) {
      setError("Select a supplier.")
      return
    }
    if (lines.length === 0) {
      setError("Add at least one line.")
      return
    }
    startTransition(async () => {
      const result = await createPurchaseAction({
        supplierId,
        shopId,
        notes,
        items: lines.map((l) => ({
          product_id: l.product_id,
          quantity_ordered: Number(l.quantity_ordered),
          unit_cost: Number(l.unit_cost),
        })),
      })
      if (result && "error" in result && result.error) {
        setError(result.error)
        toast.error(result.error)
      }
    })
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="supplierId">Supplier</FieldLabel>
          <select
            id="supplierId"
            className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
          >
            <option value="">Select supplier</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
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
      </div>

      <Field>
        <FieldLabel htmlFor="notes">Notes</FieldLabel>
        <Textarea
          id="notes"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </Field>

      <section className="space-y-3 rounded-2xl border p-4">
        <h3 className="text-sm font-medium">Add lines</h3>
        <Input
          placeholder="Search name / SKU / scan barcode then Enter"
          value={productQuery}
          onChange={(e) => setProductQuery(e.target.value)}
          onKeyDown={onBarcodeEnter}
        />
        {productQuery.trim() ? (
          <ul className="max-h-40 overflow-y-auto rounded-lg border">
            {filteredProducts.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => addProduct(p.id)}
                >
                  <span>
                    {p.name}{" "}
                    <span className="font-mono text-xs text-muted-foreground">
                      {p.sku}
                    </span>
                  </span>
                  <Plus className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="space-y-2">
          {lines.map((line) => {
            const product = products.find((p) => p.id === line.product_id)
            return (
              <div
                key={line.key}
                className="grid gap-2 rounded-xl border p-3 sm:grid-cols-[1fr_6rem_7rem_auto]"
              >
                <div className="text-sm">
                  <p className="font-medium">{product?.name ?? "Product"}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {product?.sku}
                  </p>
                </div>
                <Input
                  inputMode="decimal"
                  value={line.quantity_ordered}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((l) =>
                        l.key === line.key
                          ? { ...l, quantity_ordered: e.target.value }
                          : l
                      )
                    )
                  }
                  placeholder="Qty"
                />
                <Input
                  inputMode="decimal"
                  value={line.unit_cost}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((l) =>
                        l.key === line.key
                          ? { ...l, unit_cost: e.target.value }
                          : l
                      )
                    )
                  }
                  placeholder="Unit cost"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() =>
                    setLines((prev) => prev.filter((l) => l.key !== line.key))
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            )
          })}
        </div>

        <p className="text-sm text-muted-foreground">
          Preview total (UX only):{" "}
          {formatCurrency(previewTotal, currencyCode, currencyLocale)}. Server
          totals are authoritative after save.
        </p>
      </section>

      <Button type="submit" disabled={pending || lines.length === 0}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        Create purchase order
      </Button>
    </form>
  )
}

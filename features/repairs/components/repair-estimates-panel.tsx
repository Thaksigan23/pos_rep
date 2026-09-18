"use client"

import { useState, useTransition } from "react"
import { Loader2 } from "lucide-react"

import {
  approveEstimateAction,
  createEstimateAction,
  rejectEstimateAction,
  reviseEstimateAction,
  sendEstimateAction,
} from "@/features/repairs/actions"
import { formatCurrency } from "@/lib/money/currency"
import {
  ESTIMATE_STATUS_LABELS,
  type EstimateStatus,
} from "@/lib/repairs/constants"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { StatusBadge, type StatusTone } from "@/components/app/status-badge"

type Service = { id: string; name: string; default_labor_charge: number }
type Product = { id: string; name: string; sku: string }
type EstimateItem = {
  id: string
  line_type: string
  description_snapshot: string
  quantity: number
  unit_price: number
  line_total: number
}
type Estimate = {
  id: string
  version: number
  status: EstimateStatus
  subtotal: number
  tax_amount: number
  discount_amount: number
  total: number
  notes: string | null
  estimate_number: string
  repair_estimate_items: EstimateItem[] | null
}

function estimateTone(status: EstimateStatus): StatusTone {
  if (status === "approved") return "ready"
  if (status === "rejected" || status === "expired") return "stop"
  if (status === "sent") return "wait"
  if (status === "superseded") return "neutral"
  return "info"
}

export function RepairEstimatesPanel({
  repairId,
  estimates,
  services,
  products,
  currencyCode,
  currencyLocale,
  canSend,
}: {
  repairId: string
  estimates: Estimate[]
  services: Service[]
  products: Product[]
  currencyCode: string
  currencyLocale: string
  canSend: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string>()
  const [success, setSuccess] = useState<string>()
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "")
  const [productId, setProductId] = useState("")
  const [partQty, setPartQty] = useState("1")
  const [rejectReason, setRejectReason] = useState("")

  function createDraft() {
    setError(undefined)
    setSuccess(undefined)
    const items: Array<{
      line_type: "labor" | "part"
      repair_service_id?: string
      product_id?: string
      quantity: number
    }> = []
    if (serviceId) {
      items.push({ line_type: "labor", repair_service_id: serviceId, quantity: 1 })
    }
    if (productId) {
      items.push({
        line_type: "part",
        product_id: productId,
        quantity: Number(partQty) || 1,
      })
    }
    if (items.length === 0) {
      setError("Add at least one labor service or part.")
      return
    }
    startTransition(async () => {
      const result = await createEstimateAction({ repairId, items })
      if ("error" in result) setError(result.error)
      else if ("success" in result) setSuccess(result.success)
    })
  }

  function run(
    fn: () => Promise<{ error: string } | { success?: string }>
  ) {
    setError(undefined)
    setSuccess(undefined)
    startTransition(async () => {
      const result = await fn()
      if ("error" in result) setError(result.error)
      else if ("success" in result && result.success) setSuccess(result.success)
    })
  }

  return (
    <div className="space-y-5">
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

      <div className="space-y-3 rounded-xl border p-4">
        <h3 className="text-sm font-medium">New draft estimate</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <select
            className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
          >
            <option value="">No labor line</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} (
                {formatCurrency(s.default_labor_charge, currencyCode, currencyLocale)}
                )
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <select
              className="h-9 flex-1 rounded-lg border border-input bg-background px-3 text-sm"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
            >
              <option value="">No part line</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.sku})
                </option>
              ))}
            </select>
            <Input
              className="w-20"
              value={partQty}
              onChange={(e) => setPartQty(e.target.value)}
              placeholder="Qty"
            />
          </div>
        </div>
        <Button type="button" disabled={pending} onClick={createDraft}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          Create draft
        </Button>
      </div>

      <div className="space-y-4">
        {estimates.length === 0 ? (
          <p className="text-sm text-muted-foreground">No estimates yet.</p>
        ) : (
          estimates.map((est, index) => (
            <div
              key={est.id}
              className={
                index === 0
                  ? "rounded-xl border border-primary/30 bg-background/60 p-4 ring-1 ring-primary/10"
                  : "rounded-xl border p-4"
              }
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {est.estimate_number} · v{est.version}
                    {index === 0 ? (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        Latest
                      </span>
                    ) : null}
                  </p>
                  <p className="text-sm tabular-nums text-muted-foreground">
                    {formatCurrency(est.total, currencyCode, currencyLocale)}
                  </p>
                </div>
                <StatusBadge tone={estimateTone(est.status)}>
                  {ESTIMATE_STATUS_LABELS[est.status]}
                </StatusBadge>
              </div>
              <ul className="mt-3 space-y-1 text-sm">
                {(est.repair_estimate_items ?? []).map((item) => (
                  <li key={item.id} className="flex justify-between gap-2">
                    <span>
                      {item.description_snapshot} × {item.quantity}
                    </span>
                    <span className="tabular-nums">
                      {formatCurrency(item.line_total, currencyCode, currencyLocale)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap gap-2">
                {est.status === "draft" && canSend ? (
                  <Button
                    type="button"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      run(() => sendEstimateAction(est.id, repairId))
                    }
                  >
                    Send
                  </Button>
                ) : null}
                {(est.status === "sent" || est.status === "draft") && canSend ? (
                  <Button
                    type="button"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      run(() => approveEstimateAction(est.id, repairId))
                    }
                  >
                    Approve
                  </Button>
                ) : null}
                {est.status === "sent" ? (
                  <>
                    <Input
                      className="h-8 max-w-xs"
                      placeholder="Reject reason"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pending || !rejectReason.trim()}
                      onClick={() =>
                        run(() =>
                          rejectEstimateAction(est.id, repairId, rejectReason)
                        )
                      }
                    >
                      Reject
                    </Button>
                  </>
                ) : null}
                {est.status === "approved" ||
                est.status === "rejected" ||
                est.status === "sent" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      run(() => reviseEstimateAction(est.id, repairId))
                    }
                  >
                    Revise
                  </Button>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

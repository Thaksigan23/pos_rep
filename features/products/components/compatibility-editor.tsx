"use client"

import { useMemo, useState, useTransition } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import { setProductCompatibilityAction } from "@/features/products/actions"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"

type DeviceModel = {
  id: string
  name: string
  device_brand_id: string
  device_brands:
    | { id: string; name: string }
    | { id: string; name: string }[]
    | null
}

export function CompatibilityEditor({
  productId,
  models,
  selectedIds,
}: {
  productId: string
  models: DeviceModel[]
  selectedIds: string[]
}) {
  const [pending, startTransition] = useTransition()
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedIds))
  const [brandFilter, setBrandFilter] = useState("")
  const [q, setQ] = useState("")

  const brands = useMemo(() => {
    const map = new Map<string, string>()
    for (const m of models) {
      const brand = Array.isArray(m.device_brands)
        ? m.device_brands[0]
        : m.device_brands
      if (brand) map.set(brand.id, brand.name)
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [models])

  const filtered = models.filter((m) => {
    const brand = Array.isArray(m.device_brands)
      ? m.device_brands[0]
      : m.device_brands
    if (brandFilter && m.device_brand_id !== brandFilter) return false
    if (q && !m.name.toLowerCase().includes(q.toLowerCase())) return false
    void brand
    return true
  })

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function save() {
    startTransition(async () => {
      const result = await setProductCompatibilityAction({
        productId,
        deviceModelIds: [...selected],
      })
      if ("error" in result) toast.error(result.error)
      else toast.success(result.success)
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <select
          className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
          value={brandFilter}
          onChange={(e) => setBrandFilter(e.target.value)}
        >
          <option value="">All brands</option>
          {brands.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <Input
          className="max-w-xs"
          placeholder="Search models"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Button type="button" disabled={pending} onClick={save}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          Save compatibility ({selected.size})
        </Button>
      </div>
      <ul className="max-h-72 space-y-2 overflow-y-auto rounded-xl border p-3">
        {filtered.length === 0 ? (
          <li className="text-sm text-muted-foreground">No models match.</li>
        ) : (
          filtered.map((m) => {
            const brand = Array.isArray(m.device_brands)
              ? m.device_brands[0]
              : m.device_brands
            return (
              <li key={m.id}>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={selected.has(m.id)}
                    onCheckedChange={() => toggle(m.id)}
                  />
                  {brand?.name ? `${brand.name} · ` : ""}
                  {m.name}
                </label>
              </li>
            )
          })
        )}
      </ul>
    </div>
  )
}

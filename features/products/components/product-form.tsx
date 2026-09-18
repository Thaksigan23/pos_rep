"use client"

import { useState, useTransition } from "react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"
import { z } from "zod"
import { toast } from "sonner"

import {
  createProductAction,
  updateProductAction,
} from "@/features/products/actions"
import {
  PRODUCT_TYPE_LABELS,
  defaultTrackInventory,
  type ProductType,
} from "@/lib/inventory/constants"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

const schema = z.object({
  name: z.string().trim().min(1),
  sku: z.string().trim().min(1),
  barcode: z.string().optional(),
  productType: z.enum(["phone", "accessory", "spare_part", "other", "service"]),
  categoryId: z.string().optional(),
  brandId: z.string().optional(),
  supplierId: z.string().optional(),
  description: z.string().optional(),
  sellingPrice: z.string().min(1),
  isTaxable: z.boolean(),
  taxRateOverride: z.string().optional(),
  trackInventory: z.boolean(),
  minStock: z.string(),
  reorderLevel: z.string(),
  locationBin: z.string().optional(),
  isActive: z.boolean(),
  costPrice: z.string().optional(),
  newCategoryName: z.string().optional(),
  newBrandName: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

type Lookup = { id: string; name: string }

export function ProductForm({
  mode,
  productId,
  canEditCost,
  categories,
  brands,
  suppliers,
  defaults,
}: {
  mode: "create" | "edit"
  productId?: string
  canEditCost: boolean
  categories: Lookup[]
  brands: Lookup[]
  suppliers: Lookup[]
  defaults?: Partial<FormValues>
}) {
  const [pending, startTransition] = useTransition()
  const [formError, setFormError] = useState<string>()

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: defaults?.name ?? "",
      sku: defaults?.sku ?? "",
      barcode: defaults?.barcode ?? "",
      productType: defaults?.productType ?? "accessory",
      categoryId: defaults?.categoryId ?? "",
      brandId: defaults?.brandId ?? "",
      supplierId: defaults?.supplierId ?? "",
      description: defaults?.description ?? "",
      sellingPrice:
        defaults?.sellingPrice != null ? String(defaults.sellingPrice) : "0",
      isTaxable: defaults?.isTaxable ?? true,
      taxRateOverride: defaults?.taxRateOverride ?? "",
      trackInventory:
        defaults?.trackInventory ??
        defaultTrackInventory(defaults?.productType ?? "accessory"),
      minStock: defaults?.minStock != null ? String(defaults.minStock) : "0",
      reorderLevel:
        defaults?.reorderLevel != null ? String(defaults.reorderLevel) : "0",
      locationBin: defaults?.locationBin ?? "",
      isActive: defaults?.isActive ?? true,
      costPrice: defaults?.costPrice ?? "",
      newCategoryName: "",
      newBrandName: "",
    },
  })

  function onSubmit(values: FormValues) {
    setFormError(undefined)
    const payload = {
      ...values,
      sellingPrice: Number(values.sellingPrice),
      minStock: Number(values.minStock),
      reorderLevel: Number(values.reorderLevel),
      taxRateOverride: values.taxRateOverride
        ? Number(values.taxRateOverride)
        : null,
      costPrice:
        canEditCost && values.costPrice !== ""
          ? Number(values.costPrice)
          : null,
    }
    startTransition(async () => {
      const result =
        mode === "create"
          ? await createProductAction(payload)
          : await updateProductAction(productId!, payload)
      if (result && "error" in result && result.error) {
        setFormError(result.error)
        toast.error(result.error)
        return
      }
      if (result && "success" in result && result.success) {
        toast.success(result.success)
      }
    })
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
      {formError ? (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(form.formState.errors.name)}>
            <FieldLabel htmlFor="name">Name</FieldLabel>
            <Input id="name" {...form.register("name")} />
            <FieldError errors={[form.formState.errors.name]} />
          </Field>
          <Field data-invalid={Boolean(form.formState.errors.sku)}>
            <FieldLabel htmlFor="sku">SKU</FieldLabel>
            <Input id="sku" {...form.register("sku")} />
            <FieldError errors={[form.formState.errors.sku]} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="barcode">Barcode</FieldLabel>
            <Input id="barcode" {...form.register("barcode")} />
          </Field>
          <Field>
            <FieldLabel htmlFor="productType">Type</FieldLabel>
            <Controller
              control={form.control}
              name="productType"
              render={({ field }) => (
                <select
                  id="productType"
                  className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
                  value={field.value}
                  onChange={(e) => {
                    const type = e.target.value as ProductType
                    field.onChange(type)
                    form.setValue("trackInventory", defaultTrackInventory(type))
                  }}
                >
                  {(Object.keys(PRODUCT_TYPE_LABELS) as ProductType[]).map((t) => (
                    <option key={t} value={t}>
                      {PRODUCT_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              )}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="categoryId">Category</FieldLabel>
            <Controller
              control={form.control}
              name="categoryId"
              render={({ field }) => (
                <select
                  id="categoryId"
                  className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
                  value={field.value}
                  onChange={field.onChange}
                >
                  <option value="">None</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            />
            <Input
              className="mt-2"
              placeholder="Or create category"
              {...form.register("newCategoryName")}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="brandId">Brand</FieldLabel>
            <Controller
              control={form.control}
              name="brandId"
              render={({ field }) => (
                <select
                  id="brandId"
                  className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
                  value={field.value}
                  onChange={field.onChange}
                >
                  <option value="">None</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              )}
            />
            <Input
              className="mt-2"
              placeholder="Or create brand"
              {...form.register("newBrandName")}
            />
          </Field>
        </div>

        <Field>
          <FieldLabel htmlFor="supplierId">Default supplier</FieldLabel>
          <Controller
            control={form.control}
            name="supplierId"
            render={({ field }) => (
              <select
                id="supplierId"
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
                value={field.value}
                onChange={field.onChange}
              >
                <option value="">None</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="description">Description</FieldLabel>
          <Textarea id="description" rows={3} {...form.register("description")} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="sellingPrice">Selling price</FieldLabel>
            <Input
              id="sellingPrice"
              inputMode="decimal"
              {...form.register("sellingPrice")}
            />
          </Field>
          {canEditCost ? (
            <Field>
              <FieldLabel htmlFor="costPrice">Cost price</FieldLabel>
              <Input
                id="costPrice"
                inputMode="decimal"
                {...form.register("costPrice")}
              />
            </Field>
          ) : null}
          <Field>
            <FieldLabel htmlFor="taxRateOverride">Tax override (0–1)</FieldLabel>
            <Input
              id="taxRateOverride"
              inputMode="decimal"
              placeholder="Shop default"
              {...form.register("taxRateOverride")}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="minStock">Min stock</FieldLabel>
            <Input id="minStock" inputMode="decimal" {...form.register("minStock")} />
          </Field>
          <Field>
            <FieldLabel htmlFor="reorderLevel">Reorder level</FieldLabel>
            <Input
              id="reorderLevel"
              inputMode="decimal"
              {...form.register("reorderLevel")}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="locationBin">Location / bin</FieldLabel>
            <Input id="locationBin" {...form.register("locationBin")} />
          </Field>
        </div>

        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm">
            <Controller
              control={form.control}
              name="isTaxable"
              render={({ field }) => (
                <Checkbox
                  checked={field.value}
                  onCheckedChange={(v) => field.onChange(v === true)}
                />
              )}
            />
            Taxable
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Controller
              control={form.control}
              name="trackInventory"
              render={({ field }) => (
                <Checkbox
                  checked={field.value}
                  onCheckedChange={(v) => field.onChange(v === true)}
                />
              )}
            />
            Track inventory
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Controller
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <Checkbox
                  checked={field.value}
                  onCheckedChange={(v) => field.onChange(v === true)}
                />
              )}
            />
            Active
          </label>
        </div>
      </FieldGroup>

      <Button type="submit" disabled={pending} className="h-10 px-4">
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        {mode === "create" ? "Create product" : "Save product"}
      </Button>
    </form>
  )
}

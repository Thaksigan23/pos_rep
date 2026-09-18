"use client"

import { useMemo, useState, useTransition } from "react"
import { useForm, Controller, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"
import { z } from "zod"

import { createDeviceAction } from "@/features/customers/actions"
import { DEVICE_TYPE_LABELS, type DeviceType } from "@/lib/repairs/constants"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

const schema = z.object({
  deviceBrandId: z.string().optional(),
  deviceModelId: z.string().optional(),
  newBrandName: z.string().optional(),
  newModelName: z.string().optional(),
  deviceType: z.enum(["phone", "tablet", "laptop", "watch", "other"]),
  color: z.string().optional(),
  storageCapacity: z.string().optional(),
  imei: z.string().optional(),
  serialNumber: z.string().optional(),
  modelLabel: z.string().optional(),
  notes: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

type Brand = { id: string; name: string }
type Model = {
  id: string
  name: string
  device_brand_id: string
  device_type: DeviceType
}

export function DeviceForm({
  customerId,
  brands,
  models,
  onCreated,
}: {
  customerId: string
  brands: Brand[]
  models: Model[]
  onCreated?: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [formError, setFormError] = useState<string>()
  const [success, setSuccess] = useState<string>()

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      deviceBrandId: "",
      deviceModelId: "",
      newBrandName: "",
      newModelName: "",
      deviceType: "phone",
      color: "",
      storageCapacity: "",
      imei: "",
      serialNumber: "",
      modelLabel: "",
      notes: "",
    },
  })

  const brandId = useWatch({ control: form.control, name: "deviceBrandId" })
  const filteredModels = useMemo(
    () => models.filter((m) => !brandId || m.device_brand_id === brandId),
    [models, brandId]
  )

  function onSubmit(values: FormValues) {
    setFormError(undefined)
    setSuccess(undefined)
    startTransition(async () => {
      const result = await createDeviceAction({
        ...values,
        customerId,
      })
      if ("error" in result) {
        setFormError(result.error)
        return
      }
      setSuccess(result.success)
      form.reset({
        deviceBrandId: "",
        deviceModelId: "",
        newBrandName: "",
        newModelName: "",
        deviceType: "phone",
        color: "",
        storageCapacity: "",
        imei: "",
        serialNumber: "",
        modelLabel: "",
        notes: "",
      })
      onCreated?.()
    })
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {formError ? (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}
      {success ? (
        <Alert>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      ) : null}

      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="deviceBrandId">Brand</FieldLabel>
            <Controller
              control={form.control}
              name="deviceBrandId"
              render={({ field }) => (
                <select
                  id="deviceBrandId"
                  className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
                  value={field.value}
                  onChange={(e) => {
                    field.onChange(e.target.value)
                    form.setValue("deviceModelId", "")
                  }}
                >
                  <option value="">Select brand</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              )}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="deviceModelId">Model</FieldLabel>
            <Controller
              control={form.control}
              name="deviceModelId"
              render={({ field }) => (
                <select
                  id="deviceModelId"
                  className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
                  value={field.value}
                  onChange={field.onChange}
                >
                  <option value="">Select model</option>
                  {filteredModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              )}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="newBrandName">Or new brand</FieldLabel>
            <Input id="newBrandName" {...form.register("newBrandName")} />
          </Field>
          <Field>
            <FieldLabel htmlFor="newModelName">Or new model</FieldLabel>
            <Input id="newModelName" {...form.register("newModelName")} />
          </Field>
        </div>

        <Field>
          <FieldLabel htmlFor="deviceType">Device type</FieldLabel>
          <Controller
            control={form.control}
            name="deviceType"
            render={({ field }) => (
              <select
                id="deviceType"
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
                value={field.value}
                onChange={field.onChange}
              >
                {(Object.keys(DEVICE_TYPE_LABELS) as DeviceType[]).map((t) => (
                  <option key={t} value={t}>
                    {DEVICE_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            )}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="imei">IMEI</FieldLabel>
            <Input id="imei" {...form.register("imei")} />
          </Field>
          <Field>
            <FieldLabel htmlFor="serialNumber">Serial</FieldLabel>
            <Input id="serialNumber" {...form.register("serialNumber")} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="color">Color</FieldLabel>
            <Input id="color" {...form.register("color")} />
          </Field>
          <Field>
            <FieldLabel htmlFor="storageCapacity">Storage</FieldLabel>
            <Input id="storageCapacity" {...form.register("storageCapacity")} />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="modelLabel">Display label</FieldLabel>
          <Input
            id="modelLabel"
            placeholder="e.g. iPhone 14 Pro · Deep Purple"
            {...form.register("modelLabel")}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="notes">Notes</FieldLabel>
          <Textarea id="notes" rows={2} {...form.register("notes")} />
        </Field>
      </FieldGroup>

      <Button type="submit" disabled={pending} className="h-10 px-4">
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        Add device
      </Button>
      <FieldError errors={[form.formState.errors.root]} />
    </form>
  )
}

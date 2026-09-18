"use client"

import { useState, useTransition } from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"
import { z } from "zod"
import { toast } from "sonner"

import {
  createSupplierAction,
  updateSupplierAction,
} from "@/features/suppliers/actions"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

const schema = z.object({
  name: z.string().trim().min(1),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().optional(),
  notes: z.string().optional(),
  isActive: z.boolean(),
})

type FormValues = z.infer<typeof schema>

export function SupplierForm({
  mode,
  supplierId,
  defaults,
}: {
  mode: "create" | "edit"
  supplierId?: string
  defaults?: Partial<FormValues>
}) {
  const [pending, startTransition] = useTransition()
  const [formError, setFormError] = useState<string>()
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: defaults?.name ?? "",
      contactPerson: defaults?.contactPerson ?? "",
      phone: defaults?.phone ?? "",
      email: defaults?.email ?? "",
      address: defaults?.address ?? "",
      notes: defaults?.notes ?? "",
      isActive: defaults?.isActive ?? true,
    },
  })

  function onSubmit(values: FormValues) {
    setFormError(undefined)
    startTransition(async () => {
      const result =
        mode === "create"
          ? await createSupplierAction(values)
          : await updateSupplierAction(supplierId!, values)
      if (result && "error" in result && result.error) {
        setFormError(result.error)
        toast.error(result.error)
        return
      }
      if (result && "success" in result) toast.success(result.success)
    })
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {formError ? (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}
      <FieldGroup>
        <Field data-invalid={Boolean(form.formState.errors.name)}>
          <FieldLabel htmlFor="name">Name</FieldLabel>
          <Input id="name" {...form.register("name")} />
          <FieldError errors={[form.formState.errors.name]} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="contactPerson">Contact person</FieldLabel>
            <Input id="contactPerson" {...form.register("contactPerson")} />
          </Field>
          <Field>
            <FieldLabel htmlFor="phone">Phone</FieldLabel>
            <Input id="phone" {...form.register("phone")} />
          </Field>
        </div>
        <Field data-invalid={Boolean(form.formState.errors.email)}>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input id="email" type="email" {...form.register("email")} />
          <FieldError errors={[form.formState.errors.email]} />
        </Field>
        <Field>
          <FieldLabel htmlFor="address">Address</FieldLabel>
          <Input id="address" {...form.register("address")} />
        </Field>
        <Field>
          <FieldLabel htmlFor="notes">Notes</FieldLabel>
          <Textarea id="notes" rows={3} {...form.register("notes")} />
        </Field>
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
      </FieldGroup>
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        {mode === "create" ? "Create supplier" : "Save supplier"}
      </Button>
    </form>
  )
}

"use client"

import { useState, useTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"
import { z } from "zod"

import { acceptRepairAction } from "@/features/repairs/actions"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

const schema = z.object({
  customerName: z.string().trim().min(1, "Customer name is required"),
  phone: z.string().trim().min(5, "Phone number is required"),
  device: z.string().trim().min(1, "Device is required"),
  issue: z.string().trim().min(3, "Describe the problem"),
  price: z.string().trim().min(1, "Enter the agreed price"),
})

type FormValues = z.infer<typeof schema>

export function RepairAcceptForm({ currencyCode }: { currencyCode: string }) {
  const [pending, startTransition] = useTransition()
  const [formError, setFormError] = useState<string>()

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      customerName: "",
      phone: "",
      device: "",
      issue: "",
      price: "",
    },
  })

  function onSubmit(values: FormValues) {
    setFormError(undefined)
    const price = Number(values.price)
    if (!Number.isFinite(price) || price < 0) {
      setFormError("Enter a valid price.")
      return
    }
    startTransition(async () => {
      const result = await acceptRepairAction({
        customerName: values.customerName,
        phone: values.phone,
        device: values.device,
        issue: values.issue,
        price,
      })
      if (result && "error" in result && result.error) {
        setFormError(result.error)
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
          <Field data-invalid={Boolean(form.formState.errors.customerName)}>
            <FieldLabel htmlFor="customerName">Customer name</FieldLabel>
            <Input
              id="customerName"
              autoComplete="name"
              {...form.register("customerName")}
            />
            <FieldError errors={[form.formState.errors.customerName]} />
          </Field>
          <Field data-invalid={Boolean(form.formState.errors.phone)}>
            <FieldLabel htmlFor="phone">Phone</FieldLabel>
            <Input
              id="phone"
              inputMode="tel"
              autoComplete="tel"
              {...form.register("phone")}
            />
            <FieldError errors={[form.formState.errors.phone]} />
          </Field>
        </div>

        <Field data-invalid={Boolean(form.formState.errors.device)}>
          <FieldLabel htmlFor="device">Phone / device</FieldLabel>
          <Input
            id="device"
            placeholder="Samsung A15, iPhone 11…"
            {...form.register("device")}
          />
          <FieldError errors={[form.formState.errors.device]} />
        </Field>

        <Field data-invalid={Boolean(form.formState.errors.issue)}>
          <FieldLabel htmlFor="issue">Problem</FieldLabel>
          <Textarea id="issue" rows={3} {...form.register("issue")} />
          <FieldError errors={[form.formState.errors.issue]} />
        </Field>

        <Field data-invalid={Boolean(form.formState.errors.price)}>
          <FieldLabel htmlFor="price">Agreed price ({currencyCode})</FieldLabel>
          <Input id="price" inputMode="decimal" {...form.register("price")} />
          <FieldError errors={[form.formState.errors.price]} />
        </Field>
      </FieldGroup>

      <Button type="submit" disabled={pending} className="h-10 px-4" aria-busy={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        {pending ? "Accepting…" : "Accept repair"}
      </Button>
    </form>
  )
}

"use client"

import { useState, useTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"
import { z } from "zod"

import {
  createCustomerAction,
  updateCustomerAction,
} from "@/features/customers/actions"
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
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  alternatePhone: z.string().trim().optional(),
  email: z.string().trim().email("Invalid email").optional().or(z.literal("")),
  address: z.string().trim().optional(),
  notes: z.string().trim().optional(),
})

type FormValues = z.infer<typeof schema>

export function CustomerForm({
  mode,
  customerId,
  defaults,
}: {
  mode: "create" | "edit"
  customerId?: string
  defaults?: Partial<FormValues>
}) {
  const [pending, startTransition] = useTransition()
  const [formError, setFormError] = useState<string>()
  const [success, setSuccess] = useState<string>()

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: defaults?.firstName ?? "",
      lastName: defaults?.lastName ?? "",
      phone: defaults?.phone ?? "",
      alternatePhone: defaults?.alternatePhone ?? "",
      email: defaults?.email ?? "",
      address: defaults?.address ?? "",
      notes: defaults?.notes ?? "",
    },
  })

  function onSubmit(values: FormValues) {
    setFormError(undefined)
    setSuccess(undefined)
    startTransition(async () => {
      const result =
        mode === "create"
          ? await createCustomerAction(values)
          : await updateCustomerAction(customerId!, values)
      if (result && "error" in result && result.error) {
        setFormError(result.error)
        return
      }
      if (result && "success" in result && result.success) {
        setSuccess(result.success)
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
      {success ? (
        <Alert>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      ) : null}

      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(form.formState.errors.firstName)}>
            <FieldLabel htmlFor="firstName">First name</FieldLabel>
            <Input id="firstName" {...form.register("firstName")} />
            <FieldError errors={[form.formState.errors.firstName]} />
          </Field>
          <Field>
            <FieldLabel htmlFor="lastName">Last name</FieldLabel>
            <Input id="lastName" {...form.register("lastName")} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="phone">Phone</FieldLabel>
            <Input id="phone" {...form.register("phone")} />
          </Field>
          <Field>
            <FieldLabel htmlFor="alternatePhone">Alternate phone</FieldLabel>
            <Input id="alternatePhone" {...form.register("alternatePhone")} />
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
      </FieldGroup>

      <Button type="submit" disabled={pending} className="h-10 px-4">
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        {mode === "create" ? "Create customer" : "Save changes"}
      </Button>
    </form>
  )
}

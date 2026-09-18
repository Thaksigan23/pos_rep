"use client"

import { useState, useTransition } from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"
import { z } from "zod"

import { bootstrapOrganizationAction } from "@/features/onboarding/actions"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"

const CURRENCIES = [
  { value: "LKR", label: "LKR · Sri Lankan Rupee" },
  { value: "USD", label: "USD · US Dollar" },
  { value: "EUR", label: "EUR · Euro" },
  { value: "GBP", label: "GBP · British Pound" },
  { value: "INR", label: "INR · Indian Rupee" },
  { value: "AED", label: "AED · UAE Dirham" },
] as const

const TIMEZONES = [
  "Asia/Colombo",
  "Asia/Kolkata",
  "Asia/Dubai",
  "UTC",
  "Europe/London",
  "America/New_York",
] as const

const onboardingSchema = z.object({
  businessName: z.string().trim().min(2, "Enter the business name."),
  shopName: z.string().trim().optional(),
  currencyCode: z.string().min(3),
  timezone: z.string().min(1),
  phone: z.string().trim().optional(),
  email: z.string().trim().email("Enter a valid shop email.").optional().or(z.literal("")),
})

type OnboardingInput = z.infer<typeof onboardingSchema>

export function OnboardingForm() {
  const [pending, startTransition] = useTransition()
  const [formError, setFormError] = useState<string>()
  const form = useForm<OnboardingInput>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      businessName: "",
      shopName: "",
      currencyCode: "LKR",
      timezone: "Asia/Colombo",
      phone: "",
      email: "",
    },
  })

  function onSubmit(values: OnboardingInput) {
    setFormError(undefined)
    startTransition(async () => {
      const result = await bootstrapOrganizationAction(values)
      if (result?.error) {
        setFormError(result.error)
      }
    })
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
      {formError ? (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <FieldGroup>
        <Field data-invalid={Boolean(form.formState.errors.businessName)}>
          <FieldLabel htmlFor="businessName">Business name</FieldLabel>
          <Input
            id="businessName"
            className="h-11 text-base md:text-sm"
            autoFocus
            {...form.register("businessName")}
          />
          <FieldError errors={[form.formState.errors.businessName]} />
        </Field>

        <Field>
          <FieldLabel htmlFor="shopName">Shop name</FieldLabel>
          <Input
            id="shopName"
            className="h-11 text-base md:text-sm"
            placeholder="Main shop"
            {...form.register("shopName")}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="currencyCode">Currency</FieldLabel>
            <Controller
              control={form.control}
              name="currencyCode"
              render={({ field }) => (
                <select
                  id="currencyCode"
                  className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
                  value={field.value}
                  onChange={field.onChange}
                >
                  {CURRENCIES.map((currency) => (
                    <option key={currency.value} value={currency.value}>
                      {currency.label}
                    </option>
                  ))}
                </select>
              )}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="timezone">Timezone</FieldLabel>
            <Controller
              control={form.control}
              name="timezone"
              render={({ field }) => (
                <select
                  id="timezone"
                  className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
                  value={field.value}
                  onChange={field.onChange}
                >
                  {TIMEZONES.map((zone) => (
                    <option key={zone} value={zone}>
                      {zone}
                    </option>
                  ))}
                </select>
              )}
            />
          </Field>
        </div>

        <Field>
          <FieldLabel htmlFor="phone">Shop phone</FieldLabel>
          <Input id="phone" className="h-11 text-base md:text-sm" {...form.register("phone")} />
        </Field>

        <Field data-invalid={Boolean(form.formState.errors.email)}>
          <FieldLabel htmlFor="email">Shop email</FieldLabel>
          <Input
            id="email"
            type="email"
            className="h-11 text-base md:text-sm"
            {...form.register("email")}
          />
          <FieldError errors={[form.formState.errors.email]} />
        </Field>
      </FieldGroup>

      <Button type="submit" size="lg" className="h-11 w-full" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        Open the shop
      </Button>
    </form>
  )
}

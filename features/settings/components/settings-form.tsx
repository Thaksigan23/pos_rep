"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"
import { z } from "zod"
import { toast } from "sonner"

import { updateShopSettingsAction } from "@/features/settings/actions"
import type { ShopSettingsBundle } from "@/features/settings/queries"
import { auditPath } from "@/lib/navigation/feature-paths"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button, buttonVariants } from "@/components/ui/button"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

const schema = z.object({
  shopName: z.string().trim().min(1, "Shop name is required").max(120),
  phone: z.string().optional(),
  email: z.string().optional(),
  address: z.string().optional(),
  timezone: z
    .string()
    .trim()
    .min(1)
    .refine(
      (tz) => tz === "UTC" || tz.includes("/"),
      "Use an IANA timezone (e.g. Asia/Colombo) or UTC"
    ),
  currencyCode: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .refine((v) => /^[A-Z]{3}$/.test(v), "Currency must be 3 letters"),
  currencyLocale: z.string().trim().min(2).max(20),
  taxEnabled: z.boolean(),
  taxRatePercent: z.number().min(0).max(100),
  taxInclusive: z.boolean(),
  taxLabel: z.string().trim().min(1).max(40),
  taxId: z.string().optional(),
  businessRegistration: z.string().optional(),
  receiptFooter: z.string().optional(),
  defaultWarrantyDays: z.number().int().min(0).max(3650),
  lowStockThreshold: z.number().min(0),
  allowNegativeStock: z.boolean(),
  allowPartialPayments: z.boolean(),
  cashierMaxLineDiscountPercent: z.number().min(0).max(100),
  invoicePrefix: z.string().trim().min(1).max(20),
  repairPrefix: z.string().trim().min(1).max(20),
  purchasePrefix: z.string().trim().min(1).max(20),
  customerPrefix: z.string().trim().min(1).max(20),
  estimatePrefix: z.string().trim().min(1).max(20),
})

type FormValues = z.infer<typeof schema>

function Section({
  label,
  description,
  children,
}: {
  label: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="panel panel-pad space-y-4">
      <div>
        <p className="section-label">{label}</p>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  )
}

export function SettingsForm({ bundle }: { bundle: ShopSettingsBundle }) {
  const [pending, startTransition] = useTransition()
  const [formError, setFormError] = useState<string>()

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      shopName: bundle.shop.name,
      phone: bundle.shop.phone ?? "",
      email: bundle.shop.email ?? "",
      address: bundle.shop.address ?? "",
      timezone: bundle.settings.timezone,
      currencyCode: bundle.settings.currency_code,
      currencyLocale: bundle.settings.currency_locale,
      taxEnabled: bundle.settings.tax_enabled,
      taxRatePercent: Math.round(bundle.settings.tax_rate * 10000) / 100,
      taxInclusive: bundle.settings.tax_inclusive,
      taxLabel: bundle.settings.tax_label,
      taxId: bundle.settings.tax_id ?? "",
      businessRegistration: bundle.settings.business_registration ?? "",
      receiptFooter: bundle.settings.receipt_footer ?? "",
      defaultWarrantyDays: bundle.settings.default_warranty_days,
      lowStockThreshold: bundle.settings.low_stock_threshold,
      allowNegativeStock: bundle.settings.allow_negative_stock,
      allowPartialPayments: bundle.settings.allow_partial_payments,
      cashierMaxLineDiscountPercent:
        Math.round(bundle.settings.cashier_max_line_discount_percent * 10000) /
        100,
      invoicePrefix: bundle.settings.invoice_prefix,
      repairPrefix: bundle.settings.repair_prefix,
      purchasePrefix: bundle.settings.purchase_prefix,
      customerPrefix: bundle.settings.customer_prefix,
      estimatePrefix: bundle.settings.estimate_prefix,
    },
  })

  function onSubmit(values: FormValues) {
    setFormError(undefined)
    startTransition(async () => {
      const result = await updateShopSettingsAction(values)
      if ("error" in result) {
        setFormError(result.error)
        toast.error(result.error)
        return
      }
      toast.success(result.success)
    })
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="page-stack" noValidate>
      {formError ? (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="muted-sm">
          Changes apply to the current shop and are audited.
        </p>
        <Link
          href={auditPath()}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "btn-h")}
        >
          View audit log
        </Link>
      </div>

      <Section
        label="Shop profile"
        description="Identity shown on receipts and documents."
      >
        <FieldGroup>
          <Field data-invalid={Boolean(form.formState.errors.shopName)}>
            <FieldLabel htmlFor="shopName">Shop name</FieldLabel>
            <Input
              id="shopName"
              className="control-h"
              {...form.register("shopName")}
            />
            <FieldError errors={[form.formState.errors.shopName]} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="phone">Phone</FieldLabel>
              <Input
                id="phone"
                className="control-h"
                {...form.register("phone")}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                type="email"
                className="control-h"
                {...form.register("email")}
              />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="address">Address</FieldLabel>
            <Textarea id="address" rows={2} {...form.register("address")} />
          </Field>
          <Field>
            <FieldLabel htmlFor="businessRegistration">
              Business registration
            </FieldLabel>
            <Input
              id="businessRegistration"
              className="control-h"
              {...form.register("businessRegistration")}
            />
          </Field>
        </FieldGroup>
      </Section>

      <Section
        label="Localization"
        description="Shop timezone and currency formatting."
      >
        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field data-invalid={Boolean(form.formState.errors.timezone)}>
              <FieldLabel htmlFor="timezone">Timezone</FieldLabel>
              <Input
                id="timezone"
                className="control-h"
                placeholder="Asia/Colombo"
                {...form.register("timezone")}
              />
              <FieldError errors={[form.formState.errors.timezone]} />
            </Field>
            <Field data-invalid={Boolean(form.formState.errors.currencyCode)}>
              <FieldLabel htmlFor="currencyCode">Currency</FieldLabel>
              <Input
                id="currencyCode"
                className="control-h"
                placeholder="LKR"
                maxLength={3}
                {...form.register("currencyCode")}
              />
              <FieldError errors={[form.formState.errors.currencyCode]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="currencyLocale">Locale</FieldLabel>
              <Input
                id="currencyLocale"
                className="control-h"
                placeholder="en-LK"
                {...form.register("currencyLocale")}
              />
            </Field>
          </div>
        </FieldGroup>
      </Section>

      <Section
        label="Tax"
        description="Rates are entered as percent (e.g. 15 for 15%)."
      >
        <FieldGroup>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 rounded border"
              {...form.register("taxEnabled")}
            />
            Tax enabled
          </label>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="taxRatePercent">Tax rate (%)</FieldLabel>
              <Input
                id="taxRatePercent"
                type="number"
                step="0.01"
                className="control-h"
                {...form.register("taxRatePercent", { valueAsNumber: true })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="taxLabel">Tax label</FieldLabel>
              <Input
                id="taxLabel"
                className="control-h"
                {...form.register("taxLabel")}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="taxId">Tax ID</FieldLabel>
              <Input
                id="taxId"
                className="control-h"
                {...form.register("taxId")}
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 rounded border"
              {...form.register("taxInclusive")}
            />
            Prices include tax
          </label>
        </FieldGroup>
      </Section>

      <Section label="Receipt">
        <Field>
          <FieldLabel htmlFor="receiptFooter">Receipt footer</FieldLabel>
          <Textarea
            id="receiptFooter"
            rows={3}
            {...form.register("receiptFooter")}
          />
        </Field>
      </Section>

      <Section
        label="Repairs / Warranty"
        description="Default warranty length for new jobs."
      >
        <Field>
          <FieldLabel htmlFor="defaultWarrantyDays">
            Default warranty days
          </FieldLabel>
          <Input
            id="defaultWarrantyDays"
            type="number"
            className="control-h max-w-xs"
            {...form.register("defaultWarrantyDays", { valueAsNumber: true })}
          />
        </Field>
      </Section>

      <Section label="Inventory">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="lowStockThreshold">
              Low stock threshold
            </FieldLabel>
            <Input
              id="lowStockThreshold"
              type="number"
              className="control-h max-w-xs"
              {...form.register("lowStockThreshold", { valueAsNumber: true })}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 rounded border"
              {...form.register("allowNegativeStock")}
            />
            Allow negative stock
          </label>
        </FieldGroup>
      </Section>

      <Section
        label="POS"
        description="Cashier line discounts are capped; owners and admins are unrestricted."
      >
        <FieldGroup>
          <Field
            data-invalid={Boolean(
              form.formState.errors.cashierMaxLineDiscountPercent
            )}
          >
            <FieldLabel htmlFor="cashierMaxLineDiscountPercent">
              Cashier max line discount (%)
            </FieldLabel>
            <Input
              id="cashierMaxLineDiscountPercent"
              type="number"
              step="0.01"
              className="control-h max-w-xs"
              {...form.register("cashierMaxLineDiscountPercent", {
                valueAsNumber: true,
              })}
            />
            <FieldError
              errors={[form.formState.errors.cashierMaxLineDiscountPercent]}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 rounded border"
              {...form.register("allowPartialPayments")}
            />
            Allow partial payments (future use)
          </label>
        </FieldGroup>
      </Section>

      <Section label="Document numbers">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(
            [
              ["invoicePrefix", "Invoice"],
              ["repairPrefix", "Repair"],
              ["purchasePrefix", "Purchase"],
              ["customerPrefix", "Customer"],
              ["estimatePrefix", "Estimate"],
            ] as const
          ).map(([key, label]) => (
            <Field key={key}>
              <FieldLabel htmlFor={key}>{label}</FieldLabel>
              <Input
                id={key}
                className="control-h"
                {...form.register(key)}
              />
            </Field>
          ))}
        </div>
      </Section>

      <div className="flex justify-end">
        <Button type="submit" size="lg" className="btn-h" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          Save settings
        </Button>
      </div>
    </form>
  )
}

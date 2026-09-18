"use client"

import { useMemo, useState, useTransition } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"
import { z } from "zod"
import { toast } from "sonner"

import { createStaffAction } from "@/features/users/actions"
import type { ShopOption } from "@/features/users/queries"
import { ROLE_LABELS } from "@/lib/auth/labels"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

const schema = z.object({
  email: z.string().trim().email("Valid email required"),
  password: z.string().min(8, "At least 8 characters"),
  firstName: z.string().trim().min(1, "First name required").max(80),
  lastName: z.string().optional(),
  phone: z.string().optional(),
  role: z.enum(["admin", "cashier", "technician"]),
  shopIds: z.array(z.string()),
  defaultShopId: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

function FormSection({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-3">
      <p className="section-label">{label}</p>
      {children}
    </div>
  )
}

export function StaffCreateForm({ shops }: { shops: ShopOption[] }) {
  const [pending, startTransition] = useTransition()
  const [formError, setFormError] = useState<string>()

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: "",
      password: "",
      firstName: "",
      lastName: "",
      phone: "",
      role: "cashier",
      shopIds: shops[0] ? [shops[0].id] : [],
      defaultShopId: shops[0]?.id ?? "",
    },
  })

  const role = useWatch({ control: form.control, name: "role" })
  const shopIds = useWatch({ control: form.control, name: "shopIds" }) ?? []
  const needsShops = role === "cashier" || role === "technician"

  const shopOptions = useMemo(() => shops, [shops])

  function toggleShop(shopId: string) {
    const current = form.getValues("shopIds")
    const next = current.includes(shopId)
      ? current.filter((id) => id !== shopId)
      : [...current, shopId]
    form.setValue("shopIds", next, { shouldValidate: true })
    if (!next.includes(form.getValues("defaultShopId") ?? "")) {
      form.setValue("defaultShopId", next[0] ?? "")
    }
  }

  function onSubmit(values: FormValues) {
    setFormError(undefined)
    startTransition(async () => {
      const result = await createStaffAction({
        ...values,
        shopIds: values.shopIds,
        defaultShopId: values.defaultShopId || values.shopIds[0],
      })
      if (result && "error" in result && result.error) {
        setFormError(result.error)
        toast.error(result.error)
      }
    })
  }

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="space-y-6"
      noValidate
    >
      {formError ? (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <FormSection label="Identity">
        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={Boolean(form.formState.errors.firstName)}>
              <FieldLabel htmlFor="firstName">First name</FieldLabel>
              <Input
                id="firstName"
                className="control-h"
                {...form.register("firstName")}
              />
              <FieldError errors={[form.formState.errors.firstName]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="lastName">Last name</FieldLabel>
              <Input
                id="lastName"
                className="control-h"
                {...form.register("lastName")}
              />
            </Field>
          </div>
          <Field data-invalid={Boolean(form.formState.errors.email)}>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              type="email"
              className="control-h"
              autoComplete="off"
              {...form.register("email")}
            />
            <FieldError errors={[form.formState.errors.email]} />
          </Field>
          <Field data-invalid={Boolean(form.formState.errors.password)}>
            <FieldLabel htmlFor="password">Temporary password</FieldLabel>
            <Input
              id="password"
              type="password"
              className="control-h"
              autoComplete="new-password"
              {...form.register("password")}
            />
            <FieldError errors={[form.formState.errors.password]} />
          </Field>
          <Field>
            <FieldLabel htmlFor="phone">Phone</FieldLabel>
            <Input
              id="phone"
              className="control-h"
              {...form.register("phone")}
            />
          </Field>
        </FieldGroup>
      </FormSection>

      <FormSection label="Role">
        <Field>
          <FieldLabel htmlFor="role">Role</FieldLabel>
          <select
            id="role"
            className="control-h h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
            {...form.register("role")}
          >
            <option value="admin">{ROLE_LABELS.admin}</option>
            <option value="cashier">{ROLE_LABELS.cashier}</option>
            <option value="technician">{ROLE_LABELS.technician}</option>
          </select>
        </Field>
      </FormSection>

      {needsShops || shopOptions.length > 1 ? (
        <FormSection label="Shop">
          <Field>
            <FieldLabel>Shop access</FieldLabel>
            <div className="mt-2 space-y-2 rounded-lg border p-3">
              {shopOptions.map((shop) => (
                <label
                  key={shop.id}
                  className="flex items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    className="size-4 rounded border"
                    checked={shopIds.includes(shop.id)}
                    onChange={() => toggleShop(shop.id)}
                  />
                  {shop.name}
                </label>
              ))}
            </div>
            {needsShops && shopIds.length === 0 ? (
              <p className="mt-1 text-xs text-destructive">
                Select at least one shop for this role.
              </p>
            ) : null}
          </Field>
        </FormSection>
      ) : null}

      <Button
        type="submit"
        className="btn-h"
        disabled={pending || (needsShops && shopIds.length === 0)}
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        Create staff
      </Button>
    </form>
  )
}

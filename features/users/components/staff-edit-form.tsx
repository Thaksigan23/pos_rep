"use client"

import { useState, useTransition } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"
import { z } from "zod"
import { toast } from "sonner"

import {
  setStaffMembershipsAction,
  updateStaffAction,
} from "@/features/users/actions"
import type { ShopOption, StaffMember } from "@/features/users/queries"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

const schema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().optional(),
  phone: z.string().optional(),
  role: z.enum(["admin", "cashier", "technician", "owner"]),
  isActive: z.boolean(),
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

export function StaffEditForm({
  staff,
  shops,
  currentUserId,
}: {
  staff: StaffMember
  shops: ShopOption[]
  currentUserId: string
}) {
  const [pending, startTransition] = useTransition()
  const [memberPending, startMember] = useTransition()
  const [formError, setFormError] = useState<string>()
  const [shopIds, setShopIds] = useState<string[]>(staff.shopIds)
  const isSelf = staff.id === currentUserId
  const isOwner = staff.role === "owner"

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: staff.firstName ?? "",
      lastName: staff.lastName ?? "",
      phone: staff.phone ?? "",
      role: staff.role,
      isActive: staff.isActive,
      defaultShopId: staff.defaultShopId ?? "",
    },
  })

  const role = useWatch({ control: form.control, name: "role" })
  const needsShops = role === "cashier" || role === "technician"

  function onSubmit(values: FormValues) {
    setFormError(undefined)
    startTransition(async () => {
      const result = await updateStaffAction(staff.id, {
        firstName: values.firstName,
        lastName: values.lastName,
        phone: values.phone,
        isActive: values.isActive,
        defaultShopId: values.defaultShopId || null,
        role:
          isSelf || isOwner || values.role === "owner"
            ? undefined
            : values.role,
      })
      if ("error" in result) {
        setFormError(result.error)
        toast.error(result.error)
        return
      }
      toast.success(result.success)
    })
  }

  function saveMemberships() {
    startMember(async () => {
      const result = await setStaffMembershipsAction({
        userId: staff.id,
        shopIds,
      })
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success(result.success)
    })
  }

  function toggleShop(shopId: string) {
    setShopIds((prev) =>
      prev.includes(shopId)
        ? prev.filter((id) => id !== shopId)
        : [...prev, shopId]
    )
  }

  return (
    <div className="page-stack-tight">
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="panel panel-pad space-y-6"
        noValidate
      >
        {formError ? (
          <Alert variant="destructive">
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        ) : null}

        <FormSection label="Identity">
          <FieldGroup>
            {staff.email ? (
              <p className="text-sm text-muted-foreground">
                Email:{" "}
                <span className="font-medium text-foreground">{staff.email}</span>
              </p>
            ) : null}
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
              className="control-h h-10 w-full rounded-lg border border-input bg-background px-3 text-sm disabled:opacity-60"
              disabled={isSelf || isOwner}
              {...form.register("role")}
            >
              {isOwner ? <option value="owner">Owner</option> : null}
              <option value="admin">Admin</option>
              <option value="cashier">Cashier</option>
              <option value="technician">Technician</option>
            </select>
            {isSelf ? (
              <p className="mt-1 text-xs text-muted-foreground">
                You cannot change your own role.
              </p>
            ) : null}
          </Field>
        </FormSection>

        <FormSection label="Shop">
          <Field>
            <FieldLabel htmlFor="defaultShopId">Default shop</FieldLabel>
            <select
              id="defaultShopId"
              className="control-h h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
              {...form.register("defaultShopId")}
            >
              <option value="">—</option>
              {shops.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        </FormSection>

        <FormSection label="Status">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 rounded border"
              disabled={isSelf}
              {...form.register("isActive")}
            />
            Active
          </label>
        </FormSection>

        <Button type="submit" className="btn-h" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          Save profile
        </Button>
      </form>

      {!isOwner ? (
        <section className="panel panel-pad space-y-3">
          <div>
            <p className="section-label">Shop memberships</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {needsShops
                ? "Cashiers and technicians need at least one shop."
                : "Optional for admins; they already have org-wide access."}
            </p>
          </div>
          <div className="space-y-2">
            {shops.map((shop) => (
              <label key={shop.id} className="flex items-center gap-2 text-sm">
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
          <Button
            type="button"
            variant="outline"
            className="btn-h"
            disabled={memberPending || (needsShops && shopIds.length === 0)}
            onClick={saveMemberships}
          >
            {memberPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Update memberships
          </Button>
        </section>
      ) : null}
    </div>
  )
}

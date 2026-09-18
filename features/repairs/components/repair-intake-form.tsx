"use client"

import { useState, useTransition } from "react"
import { useForm, Controller, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"
import { z } from "zod"

import { createRepairJobAction } from "@/features/repairs/actions"
import {
  ACCESSORY_LABELS,
  ACCESSORY_TYPES,
  INTAKE_RESULT_LABELS,
  REPAIR_PRIORITY_LABELS,
  type AccessoryType,
  type IntakeCheckResult,
  type RepairPriority,
} from "@/lib/repairs/constants"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

const schema = z.object({
  customerId: z.string().uuid("Select a customer"),
  deviceId: z.string().uuid("Select a device"),
  reportedIssue: z.string().trim().min(3, "Describe the issue"),
  deviceCondition: z.string().optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  assignedTechnicianId: z.string().optional(),
  estimatedCompletionDate: z.string().optional(),
  internalNotes: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

type CustomerOption = {
  id: string
  label: string
}

type DeviceOption = {
  id: string
  label: string
  customerId: string
}

type Technician = {
  id: string
  first_name: string | null
  last_name: string | null
}

type IntakeDef = { id: string; label: string }

export function RepairIntakeForm({
  customers,
  initialCustomerId,
  initialDeviceId,
  devices,
  technicians,
  intakeDefinitions,
}: {
  customers: CustomerOption[]
  initialCustomerId?: string
  initialDeviceId?: string
  devices: DeviceOption[]
  technicians: Technician[]
  intakeDefinitions: IntakeDef[]
}) {
  const [pending, startTransition] = useTransition()
  const [formError, setFormError] = useState<string>()
  const [accessories, setAccessories] = useState<
    Record<AccessoryType, boolean>
  >(
    Object.fromEntries(ACCESSORY_TYPES.map((t) => [t, false])) as Record<
      AccessoryType,
      boolean
    >
  )
  const [intakeResults, setIntakeResults] = useState<
    Record<string, IntakeCheckResult>
  >(
    Object.fromEntries(
      intakeDefinitions.map((d) => [d.id, "not_tested" as IntakeCheckResult])
    )
  )

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      customerId: initialCustomerId ?? "",
      deviceId: initialDeviceId ?? "",
      reportedIssue: "",
      deviceCondition: "",
      priority: "normal",
      assignedTechnicianId: "",
      estimatedCompletionDate: "",
      internalNotes: "",
    },
  })

  const selectedCustomerId = useWatch({
    control: form.control,
    name: "customerId",
  })
  const filteredDevices = devices.filter(
    (d) => !selectedCustomerId || d.customerId === selectedCustomerId
  )

  function onSubmit(values: FormValues) {
    setFormError(undefined)
    startTransition(async () => {
      const result = await createRepairJobAction({
        ...values,
        accessories: ACCESSORY_TYPES.map((type) => ({
          accessory_type: type,
          present: accessories[type],
        })),
        intakeChecks: intakeDefinitions.map((def) => ({
          check_definition_id: def.id,
          result: intakeResults[def.id] ?? "not_tested",
        })),
      })
      if (result && "error" in result && result.error) {
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
        <Field data-invalid={Boolean(form.formState.errors.customerId)}>
          <FieldLabel htmlFor="customerId">Customer</FieldLabel>
          <Controller
            control={form.control}
            name="customerId"
            render={({ field }) => (
              <select
                id="customerId"
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                value={field.value}
                onChange={(e) => {
                  field.onChange(e.target.value)
                  form.setValue("deviceId", "")
                }}
              >
                <option value="">Select customer</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            )}
          />
          <FieldError errors={[form.formState.errors.customerId]} />
        </Field>

        <Field data-invalid={Boolean(form.formState.errors.deviceId)}>
          <FieldLabel htmlFor="deviceId">Device</FieldLabel>
          <Controller
            control={form.control}
            name="deviceId"
            render={({ field }) => (
              <select
                id="deviceId"
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                value={field.value}
                onChange={field.onChange}
              >
                <option value="">Select device</option>
                {filteredDevices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            )}
          />
          <p className="text-xs text-muted-foreground">
            If the list is empty, open the customer profile and add a device first.
          </p>
          <FieldError errors={[form.formState.errors.deviceId]} />
        </Field>

        <Field data-invalid={Boolean(form.formState.errors.reportedIssue)}>
          <FieldLabel htmlFor="reportedIssue">Reported issue</FieldLabel>
          <Textarea
            id="reportedIssue"
            rows={3}
            {...form.register("reportedIssue")}
          />
          <FieldError errors={[form.formState.errors.reportedIssue]} />
        </Field>

        <Field>
          <FieldLabel htmlFor="deviceCondition">Device condition</FieldLabel>
          <Textarea
            id="deviceCondition"
            rows={2}
            {...form.register("deviceCondition")}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="priority">Priority</FieldLabel>
            <Controller
              control={form.control}
              name="priority"
              render={({ field }) => (
                <select
                  id="priority"
                  className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                  value={field.value}
                  onChange={field.onChange}
                >
                  {(Object.keys(REPAIR_PRIORITY_LABELS) as RepairPriority[]).map(
                    (p) => (
                      <option key={p} value={p}>
                        {REPAIR_PRIORITY_LABELS[p]}
                      </option>
                    )
                  )}
                </select>
              )}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="assignedTechnicianId">Technician</FieldLabel>
            <Controller
              control={form.control}
              name="assignedTechnicianId"
              render={({ field }) => (
                <select
                  id="assignedTechnicianId"
                  className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                  value={field.value}
                  onChange={field.onChange}
                >
                  <option value="">Unassigned</option>
                  {technicians.map((t) => (
                    <option key={t.id} value={t.id}>
                      {[t.first_name, t.last_name].filter(Boolean).join(" ") ||
                        t.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              )}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="estimatedCompletionDate">ETA</FieldLabel>
            <Input
              id="estimatedCompletionDate"
              type="date"
              {...form.register("estimatedCompletionDate")}
            />
          </Field>
        </div>

        <Field>
          <FieldLabel htmlFor="internalNotes">Internal notes</FieldLabel>
          <Textarea
            id="internalNotes"
            rows={2}
            {...form.register("internalNotes")}
          />
        </Field>
      </FieldGroup>

      <section className="space-y-3 rounded-2xl border p-4">
        <h3 className="text-sm font-medium">Accessories received</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {ACCESSORY_TYPES.map((type) => (
            <label key={type} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={accessories[type]}
                onCheckedChange={(checked) =>
                  setAccessories((prev) => ({
                    ...prev,
                    [type]: checked === true,
                  }))
                }
              />
              {ACCESSORY_LABELS[type]}
            </label>
          ))}
        </div>
      </section>

      {intakeDefinitions.length > 0 ? (
        <section className="space-y-3 rounded-2xl border p-4">
          <h3 className="text-sm font-medium">Intake checks</h3>
          <div className="space-y-3">
            {intakeDefinitions.map((def) => (
              <div
                key={def.id}
                className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="text-sm">{def.label}</span>
                <select
                  className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
                  value={intakeResults[def.id] ?? "not_tested"}
                  onChange={(e) =>
                    setIntakeResults((prev) => ({
                      ...prev,
                      [def.id]: e.target.value as IntakeCheckResult,
                    }))
                  }
                >
                  {(
                    Object.keys(INTAKE_RESULT_LABELS) as IntakeCheckResult[]
                  ).map((r) => (
                    <option key={r} value={r}>
                      {INTAKE_RESULT_LABELS[r]}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <Button type="submit" disabled={pending} className="h-10 px-4">
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        Create repair job
      </Button>
    </form>
  )
}

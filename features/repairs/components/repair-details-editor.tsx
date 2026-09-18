"use client"

import { useState, useTransition } from "react"
import { useForm, Controller } from "react-hook-form"
import { Loader2 } from "lucide-react"

import { updateRepairDetailsAction } from "@/features/repairs/actions"
import type { AppRole } from "@/lib/auth/roles"
import {
  REPAIR_PRIORITY_LABELS,
  type RepairPriority,
} from "@/lib/repairs/constants"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

type Technician = {
  id: string
  first_name: string | null
  last_name: string | null
}

export function RepairDetailsEditor({
  repairId,
  role,
  technicians,
  defaults,
}: {
  repairId: string
  role: AppRole
  technicians: Technician[]
  defaults: {
    diagnosis: string | null
    technician_notes: string | null
    internal_notes: string | null
    assigned_technician_id: string | null
    priority: RepairPriority
    estimated_completion_date: string | null
    device_condition: string | null
  }
}) {
  const canDiagnosis = role === "owner" || role === "admin" || role === "technician"
  const canFrontDesk = role === "owner" || role === "admin" || role === "cashier"
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string>()
  const [success, setSuccess] = useState<string>()

  const form = useForm({
    defaultValues: {
      diagnosis: defaults.diagnosis ?? "",
      technician_notes: defaults.technician_notes ?? "",
      internal_notes: defaults.internal_notes ?? "",
      assigned_technician_id: defaults.assigned_technician_id ?? "",
      priority: defaults.priority,
      estimated_completion_date: defaults.estimated_completion_date ?? "",
      device_condition: defaults.device_condition ?? "",
    },
  })

  function onSubmit(values: {
    diagnosis: string
    technician_notes: string
    internal_notes: string
    assigned_technician_id: string
    priority: RepairPriority
    estimated_completion_date: string
    device_condition: string
  }) {
    setError(undefined)
    setSuccess(undefined)
    const payload: Record<string, string | null> = {}

    if (canDiagnosis) {
      payload.diagnosis = values.diagnosis
      payload.technician_notes = values.technician_notes
      payload.device_condition = values.device_condition
    }
    if (canFrontDesk) {
      payload.internal_notes = values.internal_notes
      payload.assigned_technician_id = values.assigned_technician_id || null
      payload.priority = values.priority
      payload.estimated_completion_date = values.estimated_completion_date || null
      payload.device_condition = values.device_condition
    }
    if (role === "technician") {
      delete payload.internal_notes
      delete payload.assigned_technician_id
      delete payload.priority
      delete payload.estimated_completion_date
    }

    startTransition(async () => {
      const result = await updateRepairDetailsAction(repairId, payload)
      if ("error" in result) setError(result.error)
      else if ("success" in result) setSuccess(result.success)
    })
  }

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="space-y-4"
      noValidate
    >
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {success ? (
        <Alert>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      ) : null}

      <FieldGroup>
        {canDiagnosis ? (
          <>
            <Field>
              <FieldLabel htmlFor="diagnosis">Diagnosis</FieldLabel>
              <Textarea id="diagnosis" rows={3} {...form.register("diagnosis")} />
            </Field>
            <Field>
              <FieldLabel htmlFor="technician_notes">Technician notes</FieldLabel>
              <Textarea
                id="technician_notes"
                rows={3}
                {...form.register("technician_notes")}
              />
            </Field>
          </>
        ) : null}

        <Field>
          <FieldLabel htmlFor="device_condition">Device condition</FieldLabel>
          <Textarea
            id="device_condition"
            rows={2}
            {...form.register("device_condition")}
          />
        </Field>

        {canFrontDesk ? (
          <>
            <Field>
              <FieldLabel htmlFor="internal_notes">Internal notes</FieldLabel>
              <Textarea
                id="internal_notes"
                rows={2}
                {...form.register("internal_notes")}
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
                      className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
                      value={field.value}
                      onChange={field.onChange}
                    >
                      {(
                        Object.keys(REPAIR_PRIORITY_LABELS) as RepairPriority[]
                      ).map((p) => (
                        <option key={p} value={p}>
                          {REPAIR_PRIORITY_LABELS[p]}
                        </option>
                      ))}
                    </select>
                  )}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="assigned_technician_id">Technician</FieldLabel>
                <Controller
                  control={form.control}
                  name="assigned_technician_id"
                  render={({ field }) => (
                    <select
                      id="assigned_technician_id"
                      className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
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
                <FieldLabel htmlFor="estimated_completion_date">ETA</FieldLabel>
                <Input
                  id="estimated_completion_date"
                  type="date"
                  {...form.register("estimated_completion_date")}
                />
              </Field>
            </div>
          </>
        ) : null}
      </FieldGroup>

      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        Save details
      </Button>
    </form>
  )
}

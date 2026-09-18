"use client"

import { useState, useTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"
import { z } from "zod"
import { toast } from "sonner"

import {
  createWarrantyClaimAction,
  resolveWarrantyClaimAction,
} from "@/features/warranties/actions"
import type { WarrantyClaimRow } from "@/features/warranties/queries"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import {
  WARRANTY_CLAIM_STATUS_LABELS,
  WARRANTY_CLAIM_STATUSES,
  isWarrantyClaimStatus,
} from "@/lib/warranties/constants"

const claimSchema = z.object({
  description: z.string().trim().min(1, "Description is required"),
})

const resolveSchema = z.object({
  status: z.enum(["open", "in_progress", "resolved", "rejected", "closed"]),
  resolution: z.string().optional(),
})

type ClaimValues = z.infer<typeof claimSchema>
type ResolveValues = z.infer<typeof resolveSchema>

export function WarrantyClaimForm({
  warrantyId,
  canClaim,
}: {
  warrantyId: string
  canClaim: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [formError, setFormError] = useState<string>()
  const form = useForm<ClaimValues>({
    resolver: zodResolver(claimSchema),
    defaultValues: { description: "" },
  })

  if (!canClaim) return null

  function onSubmit(values: ClaimValues) {
    setFormError(undefined)
    startTransition(async () => {
      const result = await createWarrantyClaimAction({
        warrantyId,
        description: values.description,
      })
      if ("error" in result) {
        setFormError(result.error)
        toast.error(result.error)
        return
      }
      toast.success(result.success)
      form.reset()
    })
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3" noValidate>
      {formError ? (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}
      <FieldGroup>
        <Field data-invalid={Boolean(form.formState.errors.description)}>
          <FieldLabel htmlFor="claimDescription">New claim</FieldLabel>
          <Textarea
            id="claimDescription"
            rows={3}
            placeholder="Describe the issue under warranty…"
            {...form.register("description")}
          />
          <FieldError errors={[form.formState.errors.description]} />
        </Field>
      </FieldGroup>
      <Button type="submit" disabled={pending} size="sm">
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        File claim
      </Button>
    </form>
  )
}

export function ResolveClaimForm({
  claim,
  warrantyId,
}: {
  claim: WarrantyClaimRow
  warrantyId: string
}) {
  const [pending, startTransition] = useTransition()
  const [formError, setFormError] = useState<string>()
  const form = useForm<ResolveValues>({
    resolver: zodResolver(resolveSchema),
    defaultValues: {
      status: isWarrantyClaimStatus(claim.status) ? claim.status : "open",
      resolution: claim.resolution ?? "",
    },
  })

  function onSubmit(values: ResolveValues) {
    setFormError(undefined)
    startTransition(async () => {
      const result = await resolveWarrantyClaimAction(claim.id, warrantyId, values)
      if ("error" in result) {
        setFormError(result.error)
        toast.error(result.error)
        return
      }
      toast.success(result.success)
    })
  }

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="mt-3 space-y-3 rounded-lg border bg-muted/30 p-3"
      noValidate
    >
      {formError ? (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={`status-${claim.id}`}>Status</FieldLabel>
          <select
            id={`status-${claim.id}`}
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
            {...form.register("status")}
          >
            {WARRANTY_CLAIM_STATUSES.map((s) => (
              <option key={s} value={s}>
                {WARRANTY_CLAIM_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor={`resolution-${claim.id}`}>Resolution</FieldLabel>
          <Textarea
            id={`resolution-${claim.id}`}
            rows={2}
            {...form.register("resolution")}
          />
        </Field>
      </div>
      <Button type="submit" disabled={pending} size="sm" variant="outline">
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        Update claim
      </Button>
    </form>
  )
}

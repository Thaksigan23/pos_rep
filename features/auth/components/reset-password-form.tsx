"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"

import { resetPasswordAction } from "@/features/auth/actions"
import {
  resetPasswordSchema,
  type ResetPasswordInput,
} from "@/features/auth/schemas"
import { PasswordInput } from "@/features/auth/components/password-input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { AUTH_ROUTES } from "@/lib/navigation/paths"

export function ResetPasswordForm({ hasSession }: { hasSession: boolean }) {
  const [pending, startTransition] = useTransition()
  const [formError, setFormError] = useState<string>()
  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  })

  if (!hasSession) {
    return (
      <div className="space-y-6">
        <Alert variant="destructive">
          <AlertDescription>
            This reset link is invalid or has expired. Request a new one.
          </AlertDescription>
        </Alert>
        <p className="text-center text-sm text-muted-foreground">
          <Link
            href={AUTH_ROUTES.forgotPassword}
            className="underline-offset-4 hover:text-foreground hover:underline"
          >
            Request a new reset link
          </Link>
        </p>
      </div>
    )
  }

  function onSubmit(values: ResetPasswordInput) {
    setFormError(undefined)
    startTransition(async () => {
      const result = await resetPasswordAction(values)
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
        <Field data-invalid={Boolean(form.formState.errors.password)}>
          <FieldLabel htmlFor="password">New password</FieldLabel>
          <PasswordInput
            id="password"
            autoComplete="new-password"
            autoFocus
            aria-invalid={Boolean(form.formState.errors.password)}
            {...form.register("password")}
          />
          <FieldDescription>At least 8 characters.</FieldDescription>
          <FieldError errors={[form.formState.errors.password]} />
        </Field>

        <Field data-invalid={Boolean(form.formState.errors.confirmPassword)}>
          <FieldLabel htmlFor="confirmPassword">Confirm password</FieldLabel>
          <PasswordInput
            id="confirmPassword"
            autoComplete="new-password"
            aria-invalid={Boolean(form.formState.errors.confirmPassword)}
            {...form.register("confirmPassword")}
          />
          <FieldError errors={[form.formState.errors.confirmPassword]} />
        </Field>
      </FieldGroup>

      <Button type="submit" size="lg" className="h-11 w-full" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        Update password
      </Button>
    </form>
  )
}

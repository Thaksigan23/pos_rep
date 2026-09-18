"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { CircleAlert, Loader2 } from "lucide-react"

import { loginAction } from "@/features/auth/actions"
import { loginSchema, type LoginInput } from "@/features/auth/schemas"
import { PasswordInput } from "@/features/auth/components/password-input"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { AUTH_ROUTES } from "@/lib/navigation/paths"

export function LoginForm({
  nextPath,
  errorMessage,
}: {
  nextPath: string
  errorMessage?: string
}) {
  const [pending, startTransition] = useTransition()
  const [formError, setFormError] = useState(errorMessage)
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
      next: nextPath,
    },
  })

  function onSubmit(values: LoginInput) {
    if (pending) return
    setFormError(undefined)
    startTransition(async () => {
      const result = await loginAction({ ...values, next: nextPath })
      if (result?.error) {
        setFormError(result.error)
      }
    })
  }

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="space-y-5"
      noValidate
      aria-busy={pending}
    >
      {formError ? (
        <Alert variant="destructive" className="border-destructive/30 bg-destructive/5">
          <CircleAlert aria-hidden />
          <AlertTitle>Sign in failed</AlertTitle>
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <FieldGroup>
        <Field data-invalid={Boolean(form.formState.errors.email)}>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            autoFocus
            disabled={pending}
            className="control-h text-base md:text-sm"
            aria-invalid={Boolean(form.formState.errors.email)}
            {...form.register("email")}
          />
          <FieldError errors={[form.formState.errors.email]} />
        </Field>

        <Field data-invalid={Boolean(form.formState.errors.password)}>
          <div className="flex items-center justify-between gap-2">
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Link
              href={AUTH_ROUTES.forgotPassword}
              className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              tabIndex={pending ? -1 : undefined}
            >
              Forgot password?
            </Link>
          </div>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            disabled={pending}
            aria-invalid={Boolean(form.formState.errors.password)}
            {...form.register("password")}
          />
          <FieldError errors={[form.formState.errors.password]} />
        </Field>
      </FieldGroup>

      <Button
        type="submit"
        size="lg"
        className="btn-h w-full"
        disabled={pending}
        aria-disabled={pending}
      >
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Signing in…
          </>
        ) : (
          "Sign in"
        )}
      </Button>
    </form>
  )
}

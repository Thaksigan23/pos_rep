"use server"

import { redirect } from "next/navigation"

import { mapAuthError } from "@/lib/auth/errors"
import { getRequestOrigin } from "@/lib/http/origin"
import { AUTH_ROUTES, safeInternalPath } from "@/lib/navigation/paths"
import { createClient } from "@/lib/supabase/server"
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
} from "@/features/auth/schemas"
import type { AuthActionResult } from "@/features/auth/types"

export async function loginAction(input: unknown): Promise<AuthActionResult> {
  const parsed = loginSchema.safeParse(input)

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email.trim().toLowerCase(),
    password: parsed.data.password,
  })

  if (error) {
    return { error: mapAuthError(error) }
  }

  redirect(safeInternalPath(parsed.data.next))
}

export async function logoutAction(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect(AUTH_ROUTES.login)
}

export async function forgotPasswordAction(
  input: unknown
): Promise<AuthActionResult> {
  const parsed = forgotPasswordSchema.safeParse(input)

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." }
  }

  const origin = await getRequestOrigin()
  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(
    parsed.data.email.trim().toLowerCase(),
    {
      redirectTo: `${origin}${AUTH_ROUTES.callback}?next=${AUTH_ROUTES.resetPassword}`,
    }
  )

  if (error) {
    return { error: mapAuthError(error) }
  }

  return {
    success:
      "If that email is registered, we sent a reset link. Check your inbox.",
  }
}

export async function resetPasswordAction(
  input: unknown
): Promise<AuthActionResult> {
  const parsed = resetPasswordSchema.safeParse(input)

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." }
  }

  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()

  if (!data.user) {
    return {
      error: "This reset link is invalid or has expired. Request a new one.",
    }
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  })

  if (error) {
    return { error: mapAuthError(error) }
  }

  redirect("/")
}

import { redirect } from "next/navigation"
import type { User } from "@supabase/supabase-js"

import { AUTH_ROUTES } from "@/lib/navigation/paths"
import { createClient } from "@/lib/supabase/server"

export async function getAuthenticatedUser(): Promise<User | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()

  if (error || !data.user) {
    return null
  }

  return data.user
}

export async function requireAuthenticatedUser(): Promise<User> {
  const user = await getAuthenticatedUser()

  if (!user) {
    redirect(AUTH_ROUTES.login)
  }

  return user
}

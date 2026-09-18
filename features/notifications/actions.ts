"use server"

import { revalidatePath } from "next/cache"

import { canAccess } from "@/lib/auth/permissions"
import { requireWorkspaceSession } from "@/lib/auth/workspace"
import { APP_ROUTES } from "@/lib/navigation/paths"
import { createClient } from "@/lib/supabase/server"

export type ActionResult = { error: string } | { success: string }

export async function markNotificationReadAction(
  notificationId: string
): Promise<ActionResult> {
  const session = await requireWorkspaceSession()
  if (!canAccess(session.role, "notifications")) {
    return { error: "You cannot manage notifications." }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("user_id", session.userId)
    .is("read_at", null)

  if (error) return { error: error.message }

  revalidatePath(APP_ROUTES.notifications)
  revalidatePath(APP_ROUTES.dashboard)
  return { success: "Marked read." }
}

export async function markAllReadAction(): Promise<ActionResult> {
  const session = await requireWorkspaceSession()
  if (!canAccess(session.role, "notifications")) {
    return { error: "You cannot manage notifications." }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", session.userId)
    .is("read_at", null)

  if (error) return { error: error.message }

  revalidatePath(APP_ROUTES.notifications)
  revalidatePath(APP_ROUTES.dashboard)
  return { success: "All notifications marked read." }
}

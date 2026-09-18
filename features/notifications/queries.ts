import "server-only"

import { PAGE_SIZE } from "@/lib/navigation/paths"
import { createClient } from "@/lib/supabase/server"
import type { Database } from "@/types/database"

export type NotificationListItem = {
  id: string
  title: string
  body: string | null
  event_type: Database["public"]["Enums"]["notification_event_type"]
  entity_type: string | null
  entity_id: string | null
  read_at: string | null
  created_at: string
}

export async function listNotifications(options: {
  unreadOnly?: boolean
  page?: number
}) {
  const page = Math.max(1, options.page ?? 1)
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1
  const supabase = await createClient()

  let query = supabase
    .from("notifications")
    .select(
      "id, title, body, event_type, entity_type, entity_id, read_at, created_at, user_id",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(from, to)

  if (options.unreadOnly) {
    query = query.is("read_at", null)
  }

  const { data, error, count } = await query
  if (error) throw new Error(error.message)

  return {
    rows: (data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      event_type: row.event_type,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      read_at: row.read_at,
      created_at: row.created_at,
    })) as NotificationListItem[],
    total: count ?? 0,
    page,
    pageSize: PAGE_SIZE,
  }
}

export async function countUnread(userId: string): Promise<number> {
  const supabase = await createClient()
  // Per-user unread only. Broadcast rows (user_id null) are visible but cannot be
  // marked read under current RLS, so they are excluded from the badge count.
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null)

  if (error) throw new Error(error.message)
  return count ?? 0
}

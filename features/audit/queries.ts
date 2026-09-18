import "server-only"

import { PAGE_SIZE } from "@/lib/navigation/paths"
import { createClient } from "@/lib/supabase/server"
import type { Json } from "@/types/database"

export type AuditLogRow = {
  id: string
  action: string
  entityType: string
  entityId: string | null
  createdAt: string
  performedBy: string | null
  actorName: string | null
  beforePreview: string | null
  afterPreview: string | null
  beforeJson: unknown
  afterJson: unknown
}

const SECRET_KEYS = new Set([
  "password",
  "secret",
  "token",
  "api_key",
  "service_role",
  "access_token",
  "refresh_token",
])

const HIDDEN_ENTITY_TYPES = new Set(["notification_outbox"])

function sanitizeJson(value: Json | null | undefined, depth = 0): unknown {
  if (value == null) return null
  if (depth > 6) return "[truncated]"
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((v) => sanitizeJson(v, depth + 1))
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      if (SECRET_KEYS.has(k.toLowerCase())) {
        out[k] = "[redacted]"
        continue
      }
      out[k] = sanitizeJson(v as Json, depth + 1)
    }
    return out
  }
  return value
}

function previewJson(value: Json | null | undefined, max = 280): string | null {
  if (value == null) return null
  try {
    const text = JSON.stringify(sanitizeJson(value))
    if (!text || text === "null") return null
    return text.length > max ? `${text.slice(0, max)}…` : text
  } catch {
    return null
  }
}

export async function searchAuditLogs(options: {
  organizationId: string
  from?: string
  to?: string
  actorId?: string
  action?: string
  entityType?: string
  page?: number
}): Promise<{ rows: AuditLogRow[]; total: number; pageSize: number }> {
  const page = Math.max(1, options.page ?? 1)
  const pageSize = PAGE_SIZE
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const supabase = await createClient()
  let query = supabase
    .from("audit_logs")
    .select(
      "id, action, entity_type, entity_id, created_at, performed_by, before_data, after_data, profiles!audit_logs_performed_by_fkey(first_name, last_name)",
      { count: "exact" }
    )
    .eq("organization_id", options.organizationId)
    .neq("entity_type", "notification_outbox")
    .order("created_at", { ascending: false })
    .range(from, to)

  if (options.from) {
    query = query.gte("created_at", `${options.from}T00:00:00.000Z`)
  }
  if (options.to) {
    query = query.lte("created_at", `${options.to}T23:59:59.999Z`)
  }
  if (options.actorId) {
    query = query.eq("performed_by", options.actorId)
  }
  if (options.action?.trim()) {
    query = query.ilike("action", `%${options.action.trim()}%`)
  }
  if (options.entityType?.trim()) {
    const entity = options.entityType.trim()
    if (!HIDDEN_ENTITY_TYPES.has(entity)) {
      query = query.eq("entity_type", entity)
    }
  }

  const { data, error, count } = await query
  if (error) throw new Error(error.message)

  const rows: AuditLogRow[] = (data ?? []).map((row) => {
    const profile = Array.isArray(row.profiles)
      ? row.profiles[0]
      : row.profiles
    const actorName = profile
      ? [profile.first_name, profile.last_name].filter(Boolean).join(" ") ||
        null
      : null
    return {
      id: row.id,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      createdAt: row.created_at,
      performedBy: row.performed_by,
      actorName,
      beforePreview: previewJson(row.before_data),
      afterPreview: previewJson(row.after_data),
      beforeJson: sanitizeJson(row.before_data),
      afterJson: sanitizeJson(row.after_data),
    }
  })

  return { rows, total: count ?? 0, pageSize }
}

export async function listAuditActors(organizationId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from("profiles")
    .select("id, first_name, last_name")
    .eq("organization_id", organizationId)
    .order("first_name")
  return data ?? []
}

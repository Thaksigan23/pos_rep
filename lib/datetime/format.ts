/** Display helpers for shop-local dates. Prefer IANA timezone when known. */

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value == null || value === "") return null
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }
  // Date-only YYYY-MM-DD → parse as local calendar day (avoid UTC shift)
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number)
    const dt = new Date(y, m - 1, d, 12, 0, 0)
    return Number.isNaN(dt.getTime()) ? null : dt
  }
  const dt = new Date(value)
  return Number.isNaN(dt.getTime()) ? null : dt
}

/**
 * Table-friendly calendar date, e.g. "Sep 18, 2026".
 * Pass timezone when the instant should be shown in shop-local time.
 */
export function formatDisplayDate(
  value: string | number | Date | null | undefined,
  timezone?: string | null
): string {
  const dt = toDate(value)
  if (!dt) return "—"
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(timezone ? { timeZone: timezone } : {}),
  }).format(dt)
}

/**
 * Operational timestamp, e.g. "Sep 18, 2026 · 10:42 AM".
 */
export function formatDisplayDateTime(
  value: string | number | Date | null | undefined,
  timezone?: string | null
): string {
  const dt = toDate(value)
  if (!dt) return "—"
  const date = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(timezone ? { timeZone: timezone } : {}),
  }).format(dt)
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    ...(timezone ? { timeZone: timezone } : {}),
  }).format(dt)
  return `${date} · ${time}`
}

/** Strip seed ownership prefixes from customer-facing captions. */
export function displayCaption(
  caption: string | null | undefined,
  fallback = ""
): string {
  if (!caption) return fallback
  return caption.replace(/^DEMO:\s*/i, "").trim() || fallback
}

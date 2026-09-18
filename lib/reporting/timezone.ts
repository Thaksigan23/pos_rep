/** Shop-local calendar helpers. Never hardcode a timezone. */

function partsInTimezone(timezone: string, date: Date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  })
  const parts = formatter.formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? ""
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    weekday: get("weekday"),
  }
}

function pad2(n: number) {
  return String(n).padStart(2, "0")
}

function toYmd(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`
}

/** Shift a YYYY-MM-DD by delta days using UTC noon to avoid DST edge flips. */
function shiftYmd(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split("-").map(Number)
  const utc = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  utc.setUTCDate(utc.getUTCDate() + deltaDays)
  return toYmd(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate())
}

/** YYYY-MM-DD for `date` in the given IANA timezone. */
export function localDateString(timezone: string, date = new Date()): string {
  const { year, month, day } = partsInTimezone(timezone, date)
  return toYmd(year, month, day)
}

export type ReportRangePreset = "today" | "yesterday" | "this_week" | "this_month"

/**
 * Inclusive local-date range for report presets in the shop timezone.
 * Week starts Monday (ISO-style).
 */
export function reportRangePreset(
  preset: ReportRangePreset,
  timezone: string
): { from: string; to: string } {
  const today = localDateString(timezone)
  const { weekday } = partsInTimezone(timezone, new Date())

  if (preset === "today") {
    return { from: today, to: today }
  }

  if (preset === "yesterday") {
    const yesterday = shiftYmd(today, -1)
    return { from: yesterday, to: yesterday }
  }

  if (preset === "this_week") {
    // en-CA weekday: Mon, Tue, Wed, Thu, Fri, Sat, Sun
    const offsetFromMonday: Record<string, number> = {
      Mon: 0,
      Tue: 1,
      Wed: 2,
      Thu: 3,
      Fri: 4,
      Sat: 5,
      Sun: 6,
    }
    const back = offsetFromMonday[weekday] ?? 0
    return { from: shiftYmd(today, -back), to: today }
  }

  // this_month
  const { year, month } = partsInTimezone(timezone, new Date())
  return { from: toYmd(year, month, 1), to: today }
}

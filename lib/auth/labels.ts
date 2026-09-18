import type { AppRole } from "@/lib/auth/roles"

export const ROLE_LABELS: Record<AppRole, string> = {
  owner: "Owner",
  admin: "Admin",
  cashier: "Cashier",
  technician: "Technician",
}

export function displayName(
  firstName: string | null,
  lastName: string | null,
  fallback: string
): string {
  const name = [firstName, lastName].filter(Boolean).join(" ").trim()
  return name || fallback
}

export function initials(
  firstName: string | null,
  lastName: string | null,
  fallback: string
): string {
  const fromName = [firstName, lastName]
    .filter(Boolean)
    .map((part) => part!.slice(0, 1).toUpperCase())
    .join("")

  if (fromName) {
    return fromName.slice(0, 2)
  }

  return fallback.slice(0, 2).toUpperCase()
}

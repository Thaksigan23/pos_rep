import type { ReactNode } from "react"

import { requireAuthenticatedUser } from "@/lib/auth/session"

export default async function AuthenticatedLayout({
  children,
}: {
  children: ReactNode
}) {
  await requireAuthenticatedUser()
  return children
}

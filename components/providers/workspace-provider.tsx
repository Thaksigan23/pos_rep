"use client"

import { createContext, useContext, type ReactNode } from "react"

import type { ShopSummary, WorkspaceSession } from "@/lib/auth/types"

type WorkspaceContextValue = {
  session: WorkspaceSession
  /** Current counter/shop resolved server-side. Never trust a client-supplied shop id. */
  shop: ShopSummary
  /** Shops the signed-in user may access. Ready for a future location switcher. */
  accessibleShops: ShopSummary[]
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

export function WorkspaceProvider({
  session,
  children,
}: {
  session: WorkspaceSession
  children: ReactNode
}) {
  return (
    <WorkspaceContext.Provider
      value={{
        session,
        shop: session.shop,
        accessibleShops: session.accessibleShops,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace(): WorkspaceContextValue {
  const value = useContext(WorkspaceContext)
  if (!value) {
    throw new Error("useWorkspace must be used inside WorkspaceProvider")
  }
  return value
}

export function useCurrentShop(): ShopSummary {
  return useWorkspace().shop
}

"use client"

import { useTransition } from "react"
import { Loader2, LogOut } from "lucide-react"

import { logoutAction } from "@/features/auth/actions"
import { Button } from "@/components/ui/button"

export function LogoutButton() {
  const [pending, startTransition] = useTransition()

  return (
    <Button
      type="button"
      variant="outline"
      disabled={pending}
      onClick={() => startTransition(() => logoutAction())}
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <LogOut className="size-4" />
      )}
      Sign out
    </Button>
  )
}

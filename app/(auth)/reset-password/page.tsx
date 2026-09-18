import type { Metadata } from "next"

import { ResetPasswordForm } from "@/features/auth/components/reset-password-form"
import { getAuthenticatedUser } from "@/lib/auth/session"

export const metadata: Metadata = {
  title: "Set new password",
}

export default async function ResetPasswordPage() {
  const user = await getAuthenticatedUser()

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="font-heading text-2xl tracking-tight">
          Choose a new password
        </h1>
        <p className="text-sm text-muted-foreground">
          {user
            ? `This updates the password for ${user.email}.`
            : "Open the reset link from your email to choose a new password."}
        </p>
      </div>
      <ResetPasswordForm hasSession={Boolean(user)} />
    </div>
  )
}

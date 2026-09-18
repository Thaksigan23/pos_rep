import type { Metadata } from "next"

import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form"

export const metadata: Metadata = {
  title: "Forgot password",
}

export default function ForgotPasswordPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="font-heading text-2xl tracking-tight">Reset password</h1>
        <p className="text-sm text-muted-foreground">
          Enter your staff email and we will send a reset link if the account
          exists.
        </p>
      </div>
      <ForgotPasswordForm />
    </div>
  )
}

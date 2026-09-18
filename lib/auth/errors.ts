const AUTH_ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: "Invalid email or password.",
  email_not_confirmed: "Confirm your email before signing in.",
  user_not_found: "Invalid email or password.",
  over_email_send_rate_limit: "Too many emails sent. Try again later.",
  over_request_rate_limit: "Too many attempts. Try again later.",
  same_password: "Choose a password you have not used before.",
  weak_password: "That password is too weak.",
}

export function mapAuthError(error: { code?: string; message: string }): string {
  if (error.code && AUTH_ERROR_MESSAGES[error.code]) {
    return AUTH_ERROR_MESSAGES[error.code]
  }

  const lowered = error.message.toLowerCase()
  if (lowered.includes("invalid login")) {
    return AUTH_ERROR_MESSAGES.invalid_credentials
  }

  return "Something went wrong. Please try again."
}

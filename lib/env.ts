function readEnv(name: string): string | undefined {
  const value = process.env[name]
  if (typeof value !== "string") {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export function getSupabaseUrl(): string {
  const url = readEnv("NEXT_PUBLIC_SUPABASE_URL")
  if (!url) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL. Copy .env.example to .env.local."
    )
  }
  return url
}

export function getSupabaseAnonKey(): string {
  const key =
    readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY") ??
    readEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")

  if (!key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY). Copy .env.example to .env.local."
    )
  }

  return key
}

export function getSupabaseSecretKey(): string | undefined {
  return (
    readEnv("SUPABASE_SERVICE_ROLE_KEY") ?? readEnv("SUPABASE_SECRET_KEY")
  )
}

export function getAppUrl(): string | undefined {
  const url = readEnv("NEXT_PUBLIC_APP_URL")
  return url?.replace(/\/$/, "")
}

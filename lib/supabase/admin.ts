import "server-only"

import { createClient } from "@supabase/supabase-js"

import { getSupabaseSecretKey, getSupabaseUrl } from "@/lib/env"
import type { Database } from "@/types/database"

export function createAdminClient() {
  const secretKey = getSupabaseSecretKey()

  if (!secretKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY). This client is server-only."
    )
  }

  return createClient<Database>(getSupabaseUrl(), secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

import type { NextConfig } from "next"

const buildId =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.VERCEL_DEPLOYMENT_ID ||
  process.env.NEXT_PUBLIC_APP_BUILD_ID ||
  `local-${Date.now()}`

const nextConfig: NextConfig = {
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_APP_BUILD_ID: buildId,
  },
  experimental: {
    authInterrupts: true,
  },
}

export default nextConfig

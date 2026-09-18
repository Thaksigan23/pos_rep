/**
 * Build identity used to detect deployed updates.
 * Inlined into the client via next.config `env.NEXT_PUBLIC_APP_BUILD_ID`.
 */
export function getAppBuildId(): string {
  return (
    process.env.NEXT_PUBLIC_APP_BUILD_ID ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.VERCEL_DEPLOYMENT_ID ||
    "dev"
  )
}

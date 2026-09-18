export const AUTH_ROUTES = {
  login: "/login",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  callback: "/auth/callback",
  confirm: "/auth/confirm",
} as const

export const APP_ROUTES = {
  dashboard: "/",
  onboarding: "/onboarding",
  pos: "/pos",
  sales: "/sales",
  repairs: "/repairs",
  customers: "/customers",
  products: "/products",
  inventory: "/inventory",
  purchases: "/purchases",
  suppliers: "/suppliers",
  expenses: "/expenses",
  payments: "/payments",
  warranties: "/warranties",
  reports: "/reports",
  notifications: "/notifications",
  users: "/users",
  settings: "/settings",
  audit: "/settings/audit",
} as const

export const PAGE_SIZE = 20

export const PUBLIC_PATHS = [
  AUTH_ROUTES.login,
  AUTH_ROUTES.forgotPassword,
  AUTH_ROUTES.resetPassword,
  AUTH_ROUTES.callback,
  AUTH_ROUTES.confirm,
] as const

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  )
}

export function isAuthEntryPath(pathname: string): boolean {
  return (
    pathname === AUTH_ROUTES.login || pathname === AUTH_ROUTES.forgotPassword
  )
}

export function isOnboardingPath(pathname: string): boolean {
  return (
    pathname === APP_ROUTES.onboarding ||
    pathname.startsWith(`${APP_ROUTES.onboarding}/`)
  )
}

export function firstSearchParam(
  value: string | string[] | undefined
): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export function safeInternalPath(
  path: string | null | undefined,
  fallback: string = APP_ROUTES.dashboard
): string {
  if (!path || !path.startsWith("/") || path.startsWith("//")) {
    return fallback
  }

  if (path.includes("\\") || path.includes("://")) {
    return fallback
  }

  if (path === AUTH_ROUTES.login || path === AUTH_ROUTES.forgotPassword) {
    return fallback
  }

  return path
}

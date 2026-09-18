import { headers } from "next/headers"

import { getAppUrl } from "@/lib/env"

export async function getRequestOrigin(): Promise<string> {
  const configured = getAppUrl()
  if (configured) {
    return configured
  }

  const headerList = await headers()
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host")
  const protocol = headerList.get("x-forwarded-proto") ?? "http"

  if (!host) {
    throw new Error("Unable to determine application origin.")
  }

  return `${protocol}://${host}`
}

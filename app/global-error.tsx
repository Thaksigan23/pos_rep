"use client"

import { Geist } from "next/font/google"

import { AccessDenied } from "@/components/app/access-denied"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import "./globals.css"

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
})

export default function GlobalError({
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  return (
    <html lang="en" className={cn("font-sans", geist.variable)}>
      <body>
        <div className="flex min-h-svh flex-col items-center justify-center px-6">
          <AccessDenied
            title="The counter crashed"
            description="Reload this screen. If it keeps happening, sign out and back in."
          />
          <Button type="button" className="h-11 px-4" onClick={() => retry()}>
            Try again
          </Button>
        </div>
      </body>
    </html>
  )
}

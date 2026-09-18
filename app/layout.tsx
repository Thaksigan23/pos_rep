import type { Metadata } from "next"
import type { ReactNode } from "react"
import { Geist } from "next/font/google"

import { AppProviders } from "@/components/providers/app-providers"
import { cn } from "@/lib/utils"

import "./globals.css"

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
})

export const metadata: Metadata = {
  title: {
    default: "MobilePOS",
    template: "%s · MobilePOS",
  },
  description: "Mobile phone repair shop POS and repair management.",
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={cn("font-sans", geist.variable)} suppressHydrationWarning>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  )
}

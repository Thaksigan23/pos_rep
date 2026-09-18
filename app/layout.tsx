import type { Metadata } from "next"
import type { ReactNode } from "react"
import { Inter } from "next/font/google"

import { AppProviders } from "@/components/providers/app-providers"
import { cn } from "@/lib/utils"

import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
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
    <html
      lang="en"
      className={cn("font-sans antialiased", inter.variable)}
      suppressHydrationWarning
    >
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  )
}

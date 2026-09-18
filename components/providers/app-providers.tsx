"use client"

import type { ReactNode } from "react"
import { useTheme } from "next-themes"

import { ThemeProvider } from "@/components/providers/theme-provider"
import { UpdateAvailableBanner } from "@/components/layout/update-available-banner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"

function ThemedToaster() {
  const { resolvedTheme } = useTheme()
  return (
    <Toaster
      position="top-right"
      richColors
      closeButton
      theme={resolvedTheme === "dark" ? "dark" : "light"}
    />
  )
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <TooltipProvider delay={200}>
        {children}
        <ThemedToaster />
        <UpdateAvailableBanner />
      </TooltipProvider>
    </ThemeProvider>
  )
}

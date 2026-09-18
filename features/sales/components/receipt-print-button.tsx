"use client"

import { Button } from "@/components/ui/button"

export function ReceiptPrintButton() {
  return (
    <Button type="button" onClick={() => window.print()}>
      Print receipt
    </Button>
  )
}

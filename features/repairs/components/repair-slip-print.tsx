"use client"

import { Button } from "@/components/ui/button"

export function RepairSlipPrint() {
  function print(target: "customer-slip" | "shop-sticker") {
    document.documentElement.dataset.print = target
    window.print()
  }

  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <Button type="button" onClick={() => print("customer-slip")}>
        Print customer receipt
      </Button>
      <Button type="button" variant="outline" onClick={() => print("shop-sticker")}>
        Print phone sticker
      </Button>
    </div>
  )
}

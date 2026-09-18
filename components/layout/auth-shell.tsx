import type { ReactNode } from "react"
import {
  Cable,
  ClipboardList,
  Package,
  ShoppingCart,
  Smartphone,
  Wrench,
} from "lucide-react"

const BENEFITS = [
  {
    icon: Wrench,
    title: "Repair tracking",
    body: "Track intake, estimates, parts and repair status.",
  },
  {
    icon: Package,
    title: "Inventory control",
    body: "Know what's in stock and what needs reordering.",
  },
  {
    icon: ShoppingCart,
    title: "Fast checkout",
    body: "Barcode-ready POS with payments and receipts.",
  },
] as const

function MarketingComposition() {
  return (
    <div
      className="relative mt-8 hidden max-w-lg xl:block"
      aria-hidden
    >
      <div className="grid grid-cols-[1.1fr_0.9fr] gap-3">
        <div className="space-y-2 rounded-xl border border-background/15 bg-background/5 p-3">
          <div className="flex items-center gap-2 text-[11px] tracking-wide text-background/55 uppercase">
            <ClipboardList className="size-3.5" />
            Repair ticket
          </div>
          <div className="space-y-1.5">
            <div className="h-2 w-3/4 rounded bg-background/20" />
            <div className="h-2 w-1/2 rounded bg-background/12" />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="rounded-md bg-accent px-2 py-0.5 text-[10px] font-semibold text-accent-foreground">
              In repair
            </span>
            <span className="text-[10px] text-background/45">REP-2026-0142</span>
          </div>
        </div>
        <div className="space-y-2 rounded-xl border border-background/15 bg-background/5 p-3">
          <div className="flex items-center gap-2 text-[11px] tracking-wide text-background/55 uppercase">
            <Package className="size-3.5" />
            Stock
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-background/70">
              <span className="flex items-center gap-1.5">
                <Smartphone className="size-3 opacity-60" />
                OLED panel
              </span>
              <span className="tabular-nums text-accent">3</span>
            </div>
            <div className="flex items-center justify-between text-xs text-background/70">
              <span className="flex items-center gap-1.5">
                <Cable className="size-3 opacity-60" />
                USB-C flex
              </span>
              <span className="tabular-nums text-background/50">12</span>
            </div>
          </div>
        </div>
        <div className="col-span-2 flex items-center justify-between rounded-xl border border-background/15 bg-background/5 px-3 py-2.5">
          <div className="flex items-center gap-2 text-xs text-background/70">
            <ShoppingCart className="size-3.5" />
            Checkout ready
          </div>
          <span className="text-sm font-semibold tabular-nums tracking-tight text-background">
            LKR 12,500.00
          </span>
        </div>
      </div>
    </div>
  )
}

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-svh lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <aside className="relative hidden overflow-hidden bg-sidebar text-sidebar-foreground lg:flex lg:flex-col lg:justify-between lg:px-12 lg:py-10 xl:px-14">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          aria-hidden
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, #2563eb 0, transparent 42%), radial-gradient(circle at 80% 70%, #10b981 0, transparent 38%)",
          }}
        />

        <div className="relative flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg brand-accent">
            <Smartphone className="size-5" aria-hidden />
          </div>
          <div>
            <p className="text-sm font-semibold tracking-wide">MobilePOS</p>
            <p className="text-xs text-sidebar-foreground/60">Repair & retail</p>
          </div>
        </div>

        <div className="relative max-w-lg space-y-8">
          <div className="space-y-3">
            <h1 className="font-heading text-3xl leading-[1.15] font-semibold tracking-tight xl:text-4xl">
              Counter-ready POS
              <br />
              for phone repair shops.
            </h1>
            <p className="max-w-md text-sm leading-relaxed text-sidebar-foreground/65">
              Manage repairs, inventory and checkout from one workspace.
            </p>
          </div>

          <ul className="space-y-4">
            {BENEFITS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-3">
                <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-accent">
                  <Icon className="size-4 text-primary" aria-hidden />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-sidebar-foreground/55">
                    {body}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <MarketingComposition />
        </div>

        <p className="relative text-xs text-background/40">Staff access only</p>
      </aside>

      <main className="flex items-center justify-center bg-background px-4 py-8 sm:px-8 sm:py-10">
        <div className="w-full max-w-[440px]">{children}</div>
      </main>
    </div>
  )
}

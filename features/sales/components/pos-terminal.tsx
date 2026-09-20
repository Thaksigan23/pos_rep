"use client"

import Link from "next/link"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type Dispatch,
  type SetStateAction,
} from "react"
import {
  Loader2,
  Minus,
  Plus,
  ShoppingCart,
  Trash2,
  Pause,
  ListOrdered,
  Search,
  ScanBarcode,
  CircleAlert,
  Check,
  LayoutGrid,
  List,
  ArrowRight,
  CircleCheck,
} from "lucide-react"
import { toast } from "sonner"

import {
  completeHeldSaleAction,
  completeSaleAction,
  createPosCustomerAction,
  findPosProductByBarcodeAction,
  getHeldSaleAction,
  holdSaleAction,
  listHeldSalesAction,
  searchPosCustomersAction,
  searchPosProductsAction,
  cancelSaleAction,
} from "@/features/sales/actions"
import type { PosProduct, WalkInCustomer } from "@/features/sales/queries"
import { displayName, ROLE_LABELS } from "@/lib/auth/labels"
import type { AppRole } from "@/lib/auth/roles"
import { ProductThumbnail } from "@/features/products/components/product-thumbnail"
import { useBarcodeScanner } from "@/lib/barcode/use-barcode-scanner"
import { formatCurrency, roundMoney } from "@/lib/money/currency"
import { formatDisplayDateTime } from "@/lib/datetime/format"
import {
  salePath,
  saleReceiptPath,
} from "@/lib/navigation/feature-paths"
import {
  PAYMENT_METHOD_LABELS,
  type PaymentMethod,
} from "@/lib/sales/constants"
import {
  STOCK_STATUS_LABELS,
  isStockStatus,
  type StockStatus,
} from "@/lib/inventory/constants"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

type CartLine = {
  productId: string
  name: string
  sku: string
  unitPrice: number
  quantity: number
  discountAmount: number
  trackInventory: boolean
  stockQty: number
  imageUrl: string | null
}

type CustomerOption = {
  id: string
  first_name: string
  last_name: string
  phone: string | null
  is_walk_in: boolean
  customer_number?: string
}

type HeldRow = {
  id: string
  notes: string | null
  held_at: string | null
  created_at: string
  customers:
    | { first_name: string; last_name: string; is_walk_in: boolean }
    | { first_name: string; last_name: string; is_walk_in: boolean }[]
    | null
  sale_items: { quantity: number; line_total: number; description_snapshot: string }[]
}

type HeldResume = {
  saleId: string
  notes: string | null
  customerLabel: string
  items: {
    id: string
    name: string
    quantity: number
    unitPrice: number
    discountAmount: number
    taxAmount: number
    lineTotal: number
  }[]
  subtotal: number
  taxTotal: number
  grand: number
}

type PaymentLine = {
  id: string
  method: PaymentMethod
  amount: string
  tendered: string
}

type SuccessState = {
  id: string
  saleNumber: string | null
  total: number
  changeAmount: number
}

function newPaymentLine(method: PaymentMethod = "cash"): PaymentLine {
  return {
    // Stable id for the initial SSR/CSR row; random only when adding lines after mount.
    id: crypto.randomUUID(),
    method,
    amount: "",
    tendered: "",
  }
}

const INITIAL_PAYMENT_LINE: PaymentLine = {
  id: "pay-line-0",
  method: "cash",
  amount: "",
  tendered: "",
}

function previewLineTax(options: {
  qty: number
  unitPrice: number
  discount: number
  taxEnabled: boolean
  taxRate: number
  taxInclusive: boolean
}) {
  let gross = roundMoney(options.qty * options.unitPrice - options.discount)
  if (gross < 0) gross = 0
  if (!options.taxEnabled || options.taxRate <= 0) {
    return { net: gross, tax: 0, total: gross }
  }
  if (options.taxInclusive) {
    const net = roundMoney(gross / (1 + options.taxRate))
    const tax = roundMoney(gross - net)
    return { net, tax, total: gross }
  }
  const tax = roundMoney(gross * options.taxRate)
  return { net: gross, tax, total: roundMoney(gross + tax) }
}

function customerName(c: {
  first_name: string
  last_name: string
  is_walk_in?: boolean
}) {
  if (c.is_walk_in) return "Walk-in"
  return displayName(c.first_name, c.last_name, "Customer")
}

function timeGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return "Good Morning"
  if (hour < 17) return "Good Afternoon"
  return "Good Evening"
}

export function PosTerminal({
  walkInCustomer,
  currencyCode,
  currencyLocale,
  timezone,
  shopId,
  shopName,
  categories = [],
  cashierName,
  cashierRole,
  taxEnabled = false,
  taxRate = 0,
  taxInclusive = false,
  cashierMaxLineDiscountPercent = 0.1,
}: {
  walkInCustomer: WalkInCustomer | null
  currencyCode: string
  currencyLocale: string
  timezone?: string | null
  shopId: string
  shopName: string
  categories?: { id: string; name: string }[]
  cashierName: string
  cashierRole: AppRole
  taxEnabled?: boolean
  taxRate?: number
  taxInclusive?: boolean
  /** Fraction 0–1 from shop_settings */
  cashierMaxLineDiscountPercent?: number
}) {
  const [pending, startTransition] = useTransition()
  const searchRef = useRef<HTMLInputElement>(null)
  const searchRequestId = useRef(0)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<PosProduct[]>([])
  const [searching, setSearching] = useState(false)
  const [categoryId, setCategoryId] = useState("all")
  const [sortBy, setSortBy] = useState<"name" | "price_asc" | "price_desc">(
    "name"
  )
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [cart, setCart] = useState<CartLine[]>([])
  const [customer, setCustomer] = useState<CustomerOption | null>(
    walkInCustomer
      ? {
          id: walkInCustomer.id,
          first_name: walkInCustomer.first_name,
          last_name: walkInCustomer.last_name,
          phone: walkInCustomer.phone,
          is_walk_in: true,
        }
      : null
  )
  const [customerQ, setCustomerQ] = useState("")
  const [customerResults, setCustomerResults] = useState<CustomerOption[]>([])
  const [showNewCustomer, setShowNewCustomer] = useState(false)
  const [newFirst, setNewFirst] = useState("")
  const [newLast, setNewLast] = useState("")
  const [newPhone, setNewPhone] = useState("")
  const [notes, setNotes] = useState("")
  const [paymentLines, setPaymentLines] = useState<PaymentLine[]>([
    INITIAL_PAYMENT_LINE,
  ])
  const [error, setError] = useState<string>()
  const [success, setSuccess] = useState<SuccessState>()
  const [heldOpen, setHeldOpen] = useState(false)
  const [heldRows, setHeldRows] = useState<HeldRow[]>([])
  const [resume, setResume] = useState<HeldResume | null>(null)
  const [searchFocused, setSearchFocused] = useState(false)
  const [mobileCartOpen, setMobileCartOpen] = useState(false)

  const maxDiscountPctUi = Math.round(cashierMaxLineDiscountPercent * 10000) / 100

  const totals = useMemo(() => {
    let merchandise = 0
    let discountTotal = 0
    let subtotal = 0
    let taxTotal = 0
    let discountWarn = false
    for (const line of cart) {
      const lineGross = roundMoney(line.quantity * line.unitPrice)
      merchandise = roundMoney(merchandise + lineGross)
      discountTotal = roundMoney(discountTotal + line.discountAmount)
      const maxDiscount = roundMoney(lineGross * cashierMaxLineDiscountPercent)
      if (line.discountAmount > maxDiscount + 0.0001) {
        discountWarn = true
      }
      const t = previewLineTax({
        qty: line.quantity,
        unitPrice: line.unitPrice,
        discount: line.discountAmount,
        taxEnabled,
        taxRate,
        taxInclusive,
      })
      subtotal = roundMoney(subtotal + t.net)
      taxTotal = roundMoney(taxTotal + t.tax)
    }
    return {
      merchandise,
      discountTotal,
      subtotal,
      taxTotal,
      grand: roundMoney(subtotal + taxTotal),
      discountWarn,
    }
  }, [cart, taxEnabled, taxRate, taxInclusive, cashierMaxLineDiscountPercent])

  const displayGrand = resume ? resume.grand : totals.grand

  const paymentPreview = useMemo(() => {
    let applied = 0
    let change = 0
    const remainingStart = displayGrand
    for (let i = 0; i < paymentLines.length; i++) {
      const line = paymentLines[i]
      const remaining = roundMoney(remainingStart - applied)
      if (remaining <= 0) break
      if (line.method === "cash") {
        const tendered = Number(line.tendered)
        const amount = Number(line.amount)
        if (Number.isFinite(tendered) && tendered > 0) {
          const pay = Math.min(remaining, tendered)
          applied = roundMoney(applied + pay)
          change = roundMoney(change + Math.max(0, tendered - pay))
        } else if (Number.isFinite(amount) && amount > 0) {
          applied = roundMoney(applied + Math.min(remaining, amount))
        }
      } else {
        const amount = Number(line.amount)
        if (Number.isFinite(amount) && amount > 0) {
          applied = roundMoney(applied + Math.min(remaining, amount))
        }
      }
    }
    return {
      applied,
      change,
      remaining: roundMoney(displayGrand - applied),
      covers: roundMoney(displayGrand - applied) <= 0.001,
    }
  }, [paymentLines, displayGrand])

  const runSearch = useCallback((q: string) => {
    const requestId = ++searchRequestId.current
    setSearching(true)
    startTransition(async () => {
      try {
        const result = await searchPosProductsAction(q)
        if (requestId !== searchRequestId.current) return
        if ("error" in result) {
          toast.error(result.error)
          return
        }
        setResults(result.rows)
      } finally {
        if (requestId === searchRequestId.current) setSearching(false)
      }
    })
  }, [])

  useEffect(() => {
    const t = setTimeout(() => {
      runSearch(query)
    }, query.trim() ? 250 : 0)
    return () => clearTimeout(t)
  }, [query, runSearch])

  useEffect(() => {
    const t = setTimeout(() => {
      if (customerQ.trim().length < 1) {
        setCustomerResults([])
        return
      }
      startTransition(async () => {
        const result = await searchPosCustomersAction(customerQ)
        if ("error" in result) return
        setCustomerResults(result.rows as CustomerOption[])
      })
    }, 250)
    return () => clearTimeout(t)
  }, [customerQ])

  function addProduct(product: PosProduct) {
    setSuccess(undefined)
    setError(undefined)
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === product.product_id)
      if (existing) {
        return prev.map((l) =>
          l.productId === product.product_id
            ? { ...l, quantity: roundMoney(l.quantity + 1) }
            : l
        )
      }
      return [
        ...prev,
        {
          productId: product.product_id,
          name: product.name,
          sku: product.sku,
          unitPrice: Number(product.selling_price),
          quantity: 1,
          discountAmount: 0,
          trackInventory: Boolean(product.track_inventory),
          stockQty: Number(product.quantity ?? 0),
          imageUrl: product.primary_image_url,
        },
      ]
    })
  }

  async function handleBarcode(code: string) {
    setError(undefined)
    const result = await findPosProductByBarcodeAction(code)
    if ("error" in result) {
      toast.error(result.error)
      return
    }
    if (result.product) {
      addProduct(result.product)
      setQuery("")
      setResults([])
      return
    }
    setQuery(code)
    runSearch(code)
  }

  useBarcodeScanner({
    enabled: !searchFocused && !resume,
    onScan: (code) => {
      void handleBarcode(code)
    },
  })

  function updateQty(productId: string, quantity: number) {
    if (quantity <= 0) {
      setCart((prev) => prev.filter((l) => l.productId !== productId))
      return
    }
    setCart((prev) =>
      prev.map((l) => (l.productId === productId ? { ...l, quantity } : l))
    )
  }

  function updateDiscount(productId: string, discountAmount: number) {
    setCart((prev) =>
      prev.map((l) =>
        l.productId === productId
          ? { ...l, discountAmount: Math.max(0, discountAmount) }
          : l
      )
    )
  }

  function clearCart() {
    setCart([])
    setNotes("")
    setPaymentLines([newPaymentLine("cash")])
    setResume(null)
    setSuccess(undefined)
    setError(undefined)
    if (walkInCustomer) {
      setCustomer({
        id: walkInCustomer.id,
        first_name: walkInCustomer.first_name,
        last_name: walkInCustomer.last_name,
        phone: walkInCustomer.phone,
        is_walk_in: true,
      })
    }
  }

  function buildPaymentsPayloadFromLines() {
    return paymentLines.map((line) => {
      if (line.method === "cash") {
        const tendered = Number(line.tendered)
        const amount = Number(line.amount)
        return {
          method: "cash" as const,
          tenderedAmount:
            Number.isFinite(tendered) && tendered > 0 ? tendered : undefined,
          amount: Number.isFinite(amount) && amount > 0 ? amount : undefined,
        }
      }
      const amount = Number(line.amount)
      return {
        method: line.method,
        amount: Number.isFinite(amount) && amount > 0 ? amount : undefined,
      }
    })
  }

  function validatePaymentsClient(grand: number): string | undefined {
    if (paymentLines.length === 0) return "Add at least one payment."
    if (paymentLines.length === 1) {
      const line = paymentLines[0]
      if (line.method === "cash" && !(Number(line.tendered) > 0)) {
        return "Enter cash tendered."
      }
      return undefined
    }
    if (!paymentPreview.covers) {
      return `Payments must cover the total (${formatCurrency(grand, currencyCode, currencyLocale)}). Remaining ${formatCurrency(paymentPreview.remaining, currencyCode, currencyLocale)}.`
    }
    for (const line of paymentLines) {
      if (line.method === "cash") {
        if (!(Number(line.tendered) > 0) && !(Number(line.amount) > 0)) {
          return "Each cash line needs tendered or amount."
        }
      } else if (!(Number(line.amount) > 0)) {
        return "Each non-cash payment needs an amount."
      }
    }
    return undefined
  }

  function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return
    e.preventDefault()
    const code = query.trim()
    if (!code) return
    void handleBarcode(code)
  }

  function complete() {
    setError(undefined)
    if (!customer) {
      setError("Select a customer (walk-in is fine).")
      return
    }
    if (cart.length === 0) {
      setError("Add at least one product.")
      return
    }
    const payErr = validatePaymentsClient(totals.grand)
    if (payErr) {
      setError(payErr)
      return
    }

    startTransition(async () => {
      const result = await completeSaleAction({
        items: cart.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          discountAmount: l.discountAmount || undefined,
        })),
        customerId: customer.id,
        notes: notes || undefined,
        payments: buildPaymentsPayloadFromLines(),
        idempotencyKey: crypto.randomUUID(),
      })
      if ("error" in result) {
        setError(result.error)
        return
      }
      setSuccess({
        id: result.id!,
        saleNumber: result.saleNumber ?? null,
        total: result.total ?? totals.grand,
        changeAmount: result.changeAmount ?? 0,
      })
      setCart([])
      setNotes("")
      setPaymentLines([newPaymentLine("cash")])
    })
  }

  function hold() {
    setError(undefined)
    if (cart.length === 0) {
      setError("Add at least one product to hold.")
      return
    }
    startTransition(async () => {
      const result = await holdSaleAction({
        items: cart.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          discountAmount: l.discountAmount || undefined,
        })),
        customerId: customer?.id,
        notes: notes || undefined,
      })
      if ("error" in result) {
        setError(result.error)
        return
      }
      toast.success("Sale held")
      clearCart()
    })
  }

  function openHeld() {
    setHeldOpen(true)
    startTransition(async () => {
      const result = await listHeldSalesAction()
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      setHeldRows(result.rows as HeldRow[])
    })
  }

  function resumeHeld(saleId: string) {
    startTransition(async () => {
      const result = await getHeldSaleAction(saleId)
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      const sale = result.sale
      const cust = Array.isArray(sale.customers) ? sale.customers[0] : sale.customers
      const items = (sale.sale_items ?? []).map((item) => ({
        id: item.id,
        name: item.description_snapshot,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unit_price),
        discountAmount: Number(item.discount_amount),
        taxAmount: Number(item.tax_amount),
        lineTotal: Number(item.line_total),
      }))
      setResume({
        saleId: sale.id,
        notes: sale.notes,
        customerLabel: cust ? customerName(cust) : "Walk-in",
        items,
        subtotal: result.totals.subtotal,
        taxTotal: result.totals.taxTotal,
        grand: result.totals.grand,
      })
      setCart([])
      setHeldOpen(false)
      setSuccess(undefined)
      setError(undefined)
      setPaymentLines([newPaymentLine("cash")])
    })
  }

  function completeHeld() {
    if (!resume) return
    setError(undefined)
    const payErr = validatePaymentsClient(resume.grand)
    if (payErr) {
      setError(payErr)
      return
    }
    startTransition(async () => {
      const result = await completeHeldSaleAction({
        saleId: resume.saleId,
        payments: buildPaymentsPayloadFromLines(),
        notes: resume.notes || undefined,
        idempotencyKey: crypto.randomUUID(),
      })
      if ("error" in result) {
        setError(result.error)
        return
      }
      setSuccess({
        id: result.id!,
        saleNumber: result.saleNumber ?? null,
        total: result.total ?? resume.grand,
        changeAmount: result.changeAmount ?? 0,
      })
      setResume(null)
      setPaymentLines([newPaymentLine("cash")])
    })
  }

  function cancelHeld(saleId: string) {
    const reason = window.prompt("Reason for cancelling this held sale?")
    if (!reason?.trim()) return
    startTransition(async () => {
      const result = await cancelSaleAction({ saleId, reason: reason.trim() })
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success("Held sale cancelled")
      const refreshed = await listHeldSalesAction()
      if ("rows" in refreshed) setHeldRows(refreshed.rows as HeldRow[])
      if (resume?.saleId === saleId) setResume(null)
    })
  }

  function createCustomer() {
    startTransition(async () => {
      const result = await createPosCustomerAction({
        firstName: newFirst,
        lastName: newLast,
        phone: newPhone,
      })
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      if (result.id) {
        setCustomer({
          id: result.id,
          first_name: newFirst,
          last_name: newLast,
          phone: newPhone || null,
          is_walk_in: false,
        })
        setShowNewCustomer(false)
        setNewFirst("")
        setNewLast("")
        setNewPhone("")
        toast.success("Customer added")
      }
    })
  }

  const cartItemCount = cart.reduce((n, l) => n + l.quantity, 0)

  function stockLabel(p: PosProduct) {
    if (!p.track_inventory) return "Not tracked"
    const status = p.stock_status
    if (status && isStockStatus(status)) {
      const label = STOCK_STATUS_LABELS[status as StockStatus]
      if (status === "not_tracked") return label
      return `${label} · ${Number(p.quantity ?? 0)}`
    }
    return `Stock · ${Number(p.quantity ?? 0)}`
  }

  function stockTone(p: PosProduct) {
    if (!p.track_inventory) return "text-muted-foreground"
    if (p.stock_status === "out_of_stock" || Number(p.quantity ?? 0) <= 0) {
      return "text-destructive"
    }
    if (p.stock_status === "low_stock") return "text-amber-700 dark:text-amber-300"
    return "text-emerald-700 dark:text-emerald-400"
  }

  const cartIds = useMemo(
    () => new Set(cart.map((l) => l.productId)),
    [cart]
  )

  const catalog = useMemo(() => {
    let rows = results
    if (categoryId !== "all") {
      rows = rows.filter((p) => p.category_id === categoryId)
    }
    const sorted = [...rows]
    sorted.sort((a, b) => {
      if (sortBy === "price_asc") {
        return Number(a.selling_price) - Number(b.selling_price)
      }
      if (sortBy === "price_desc") {
        return Number(b.selling_price) - Number(a.selling_price)
      }
      return a.name.localeCompare(b.name)
    })
    return sorted
  }, [results, categoryId, sortBy])

  const checkoutProps = {
    pending,
    walkInCustomer,
    customer,
    setCustomer,
    customerQ,
    setCustomerQ,
    customerResults,
    setCustomerResults,
    showNewCustomer,
    setShowNewCustomer,
    newFirst,
    setNewFirst,
    newLast,
    setNewLast,
    newPhone,
    setNewPhone,
    notes,
    setNotes,
    cart,
    setCart,
    clearCart,
    updateQty,
    updateDiscount,
    taxEnabled,
    taxRate,
    taxInclusive,
    cashierMaxLineDiscountPercent,
    maxDiscountPctUi,
    totals,
    displayGrand,
    paymentLines,
    setPaymentLines,
    paymentPreview,
    currencyCode,
    currencyLocale,
    onComplete: complete,
    onHold: hold,
    createCustomer,
  } as const

  return (
    <div
      className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-muted"
      data-shop-id={shopId}
    >
      {success ? (
        <Dialog
          open
          disablePointerDismissal
          onOpenChange={(open, details) => {
            // Static backdrop: ignore outside click / Escape — only Close button
            // (close-press) or our action buttons may dismiss.
            if (!open && details.reason === "close-press") {
              setSuccess(undefined)
            }
          }}
        >
          <DialogContent
            className="sm:max-w-md"
            showCloseButton
          >
            <DialogHeader className="items-center text-center sm:items-center">
              <div className="mb-1 flex size-12 items-center justify-center rounded-full bg-accent/15 text-accent">
                <CircleCheck className="size-7" aria-hidden />
              </div>
              <DialogTitle className="text-lg">Sale completed</DialogTitle>
              <DialogDescription className="text-center">
                Sale {success.saleNumber ?? success.id.slice(0, 8)} ·{" "}
                {formatCurrency(success.total, currencyCode, currencyLocale)}
                {success.changeAmount > 0
                  ? ` · Change ${formatCurrency(success.changeAmount, currencyCode, currencyLocale)}`
                  : ""}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="sm:justify-stretch sm:flex-col sm:gap-2">
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => setSuccess(undefined)}
              >
                Close
              </Button>
              <Button
                type="button"
                className="w-full"
                onClick={() => {
                  clearCart()
                }}
              >
                New sale
              </Button>
              <Link
                href={saleReceiptPath(success.id)}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "w-full"
                )}
                onClick={() => setSuccess(undefined)}
              >
                Print receipt
              </Link>
              <Link
                href={salePath(success.id)}
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "w-full"
                )}
                onClick={() => setSuccess(undefined)}
              >
                View sale
              </Link>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      {error ? (
        <div className="shrink-0 border-b bg-background px-4 py-2 md:px-5">
          <Alert
            variant="destructive"
            className="border-destructive/30 bg-destructive/5"
          >
            <CircleAlert aria-hidden />
            <AlertTitle>Checkout error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      ) : null}

      {resume ? (
        <div className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)] xl:grid-cols-[minmax(0,1fr)_minmax(22rem,26rem)]">
          <div className="min-h-0 space-y-3 overflow-auto p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  Resume held sale
                </p>
                <h2 className="font-heading text-lg font-semibold">Cart locked</h2>
                <p className="text-sm text-muted-foreground">
                  Customer: {resume.customerLabel}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setResume(null)}
              >
                Cancel resume
              </Button>
            </div>
            <ul className="divide-y rounded-xl border bg-card">
              {resume.items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
                >
                  <div>
                    <p className="font-medium">{item.name}</p>
                    <p className="text-muted-foreground">
                      {item.quantity} ×{" "}
                      {formatCurrency(item.unitPrice, currencyCode, currencyLocale)}
                    </p>
                  </div>
                  <p className="font-medium tabular-nums">
                    {formatCurrency(item.lineTotal, currencyCode, currencyLocale)}
                  </p>
                </li>
              ))}
            </ul>
          </div>
          <aside className="flex min-h-0 flex-col overflow-hidden border-t bg-background lg:border-t-0 lg:border-l">
            <div className="min-h-0 flex-1 overflow-hidden p-3">
              <PaymentPanel
                pending={pending}
                paymentLines={paymentLines}
                setPaymentLines={setPaymentLines}
                grand={resume.grand}
                merchandise={resume.subtotal + resume.taxTotal}
                discountTotal={0}
                subtotal={resume.subtotal}
                taxTotal={resume.taxTotal}
                paymentPreview={paymentPreview}
                currencyCode={currencyCode}
                currencyLocale={currencyLocale}
                onComplete={completeHeld}
                completeLabel={`Complete held sale · ${formatCurrency(resume.grand, currencyCode, currencyLocale)}`}
                hideHold
                maxDiscountPctUi={maxDiscountPctUi}
                discountWarn={false}
              />
            </div>
          </aside>
        </div>
      ) : (
        <div className="grid min-h-0 min-w-0 flex-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(21rem,24rem)] xl:grid-cols-[minmax(0,1fr)_minmax(22rem,26rem)]">
          <section className="flex min-h-0 min-w-0 flex-col overflow-hidden p-4 md:p-5">
            <div className="mb-4 flex shrink-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">{timeGreeting()}</p>
                <h1 className="font-heading truncate text-2xl font-bold tracking-tight">
                  {shopName}
                </h1>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9"
                  onClick={openHeld}
                >
                  <ListOrdered className="size-3.5" aria-hidden />
                  <span className="hidden sm:inline">Held</span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="relative h-9 lg:hidden"
                  onClick={() => setMobileCartOpen(true)}
                  aria-label={`Open cart, ${cartItemCount} items`}
                >
                  <ShoppingCart className="size-3.5" aria-hidden />
                  Cart
                  {cartItemCount > 0 ? (
                    <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-foreground/20 px-1 text-[10px] font-semibold">
                      {cartItemCount > 99 ? "99+" : Math.round(cartItemCount)}
                    </span>
                  ) : null}
                </Button>
                <div className="hidden items-center gap-2 rounded-full border bg-background px-2 py-1 sm:flex">
                  <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {cashierName.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="pr-1 leading-tight">
                    <span className="block max-w-[8rem] truncate text-sm font-medium">
                      {cashierName}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      {ROLE_LABELS[cashierRole]}
                    </span>
                  </span>
                </div>
              </div>
            </div>

            <div className="mb-3 flex shrink-0 flex-wrap items-center gap-2">
              <h2 className="font-heading mr-auto text-lg font-semibold">Products</h2>
              <select
                className="h-9 rounded-lg border border-input bg-background px-2.5 text-sm"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                aria-label="Filter by category"
              >
                <option value="all">All Categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
                <Search
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  ref={searchRef}
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                  onKeyDown={onSearchKeyDown}
                  placeholder="Search..."
                  className="h-9 border-input bg-background pr-9 pl-9"
                  aria-label="Search products or scan barcode"
                />
                <ScanBarcode
                  className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
              </div>
            </div>

            <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2 text-sm">
              <p className="text-muted-foreground">
                {searching
                  ? "Loading…"
                  : `${catalog.length} item${catalog.length === 1 ? "" : "s"} found`}
              </p>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="text-xs">Sort by</span>
                  <select
                    className="h-8 rounded-lg border border-input bg-background px-2 text-sm text-foreground"
                    value={sortBy}
                    onChange={(e) =>
                      setSortBy(
                        e.target.value as "name" | "price_asc" | "price_desc"
                      )
                    }
                  >
                    <option value="name">Name</option>
                    <option value="price_asc">Price ↑</option>
                    <option value="price_desc">Price ↓</option>
                  </select>
                </label>
                <div className="flex rounded-lg border bg-background p-0.5">
                  <button
                    type="button"
                    className={cn(
                      "rounded-md p-1.5",
                      viewMode === "grid" && "bg-primary text-primary-foreground"
                    )}
                    onClick={() => setViewMode("grid")}
                    aria-label="Grid view"
                  >
                    <LayoutGrid className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "rounded-md p-1.5",
                      viewMode === "list" && "bg-primary text-primary-foreground"
                    )}
                    onClick={() => setViewMode("list")}
                    aria-label="List view"
                  >
                    <List className="size-3.5" />
                  </button>
                </div>
              </div>
            </div>

            <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
              {searching && catalog.length === 0 ? (
                <div
                  className="flex h-40 flex-col items-center justify-center rounded-xl border border-dashed bg-background px-4 text-center"
                  aria-busy="true"
                >
                  <Loader2
                    className="mb-2 size-8 animate-spin text-muted-foreground"
                    aria-hidden
                  />
                  <p className="text-sm font-medium">Loading products…</p>
                </div>
              ) : catalog.length === 0 ? (
                <div className="flex h-40 flex-col items-center justify-center rounded-xl border border-dashed bg-background px-4 text-center">
                  <ScanBarcode
                    className="mb-2 size-8 text-muted-foreground/50"
                    aria-hidden
                  />
                  <p className="text-sm font-medium">No products found</p>
                  <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                    Try another search, category, or scan a barcode.
                  </p>
                </div>
              ) : viewMode === "list" ? (
                <ul className="space-y-2">
                  {catalog.map((p) => {
                    const inCart = cartIds.has(p.product_id)
                    const out =
                      p.track_inventory &&
                      (p.stock_status === "out_of_stock" ||
                        Number(p.quantity ?? 0) <= 0)
                    return (
                      <li key={p.product_id}>
                        <button
                          type="button"
                          className={cn(
                            "relative flex w-full items-center gap-3 rounded-xl border bg-background p-2.5 text-left transition hover:border-primary/40",
                            inCart && "border-primary/50 ring-1 ring-primary/20",
                            out && "opacity-60"
                          )}
                          onClick={() => addProduct(p)}
                        >
                          <ProductThumbnail
                            src={p.primary_image_url}
                            alt=""
                            size="pos"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="line-clamp-1 text-sm font-medium">
                              {p.name}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {p.sku}
                            </span>
                          </span>
                          <span className="text-sm font-bold text-primary tabular-nums">
                            {formatCurrency(
                              Number(p.selling_price),
                              currencyCode,
                              currencyLocale
                            )}
                          </span>
                          {inCart ? (
                            <span className="flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                              <Check className="size-3.5" />
                            </span>
                          ) : null}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <ul className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-3 sm:grid-cols-[repeat(3,minmax(0,1fr))] xl:grid-cols-[repeat(4,minmax(0,1fr))]">
                  {catalog.map((p) => {
                    const inCart = cartIds.has(p.product_id)
                    const out =
                      p.track_inventory &&
                      (p.stock_status === "out_of_stock" ||
                        Number(p.quantity ?? 0) <= 0)
                    return (
                      <li key={p.product_id} className="min-w-0">
                        <button
                          type="button"
                          className={cn(
                            "relative flex w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-border/80 bg-background text-left transition",
                            "hover:border-primary/40 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring",
                            inCart && "border-primary/50 ring-1 ring-primary/20",
                            out && "opacity-60"
                          )}
                          onClick={() => addProduct(p)}
                        >
                          {inCart ? (
                            <span className="absolute top-2 right-2 z-10 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                              <Check className="size-3.5" strokeWidth={3} />
                            </span>
                          ) : null}
                          <span className="flex aspect-square w-full items-center justify-center overflow-hidden bg-muted/50">
                            <ProductThumbnail
                              src={p.primary_image_url}
                              alt=""
                              size="fill"
                              className="rounded-none border-0 bg-transparent"
                            />
                          </span>
                          <span className="min-w-0 space-y-1 p-3">
                            <span className="line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-snug">
                              {p.name}
                            </span>
                            <span className="block text-base font-bold text-primary tabular-nums">
                              {formatCurrency(
                                Number(p.selling_price),
                                currencyCode,
                                currencyLocale
                              )}
                            </span>
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </section>

          <aside className="hidden min-h-0 flex-col overflow-hidden border-l bg-background lg:flex">
            <CheckoutColumn {...checkoutProps} />
          </aside>
        </div>
      )}

      <Sheet open={mobileCartOpen} onOpenChange={setMobileCartOpen}>
        <SheetContent
          side="bottom"
          className="flex h-[92svh] flex-col gap-0 p-0 sm:max-w-none"
          showCloseButton
        >
          <SheetHeader className="shrink-0 border-b px-4 py-3 text-left">
            <SheetTitle>Shopping Cart</SheetTitle>
            <SheetDescription>
              {cartItemCount > 0
                ? `${Math.round(cartItemCount)} item${cartItemCount === 1 ? "" : "s"}`
                : "Add products to begin"}
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-hidden">
            <CheckoutColumn {...checkoutProps} />
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={heldOpen} onOpenChange={setHeldOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Held sales</SheetTitle>
            <SheetDescription>
              Resume to take payment, or cancel a held ticket.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-2 overflow-auto px-4 pb-4">
            {pending && heldRows.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Loading…
              </p>
            ) : null}
            {heldRows.length === 0 && !pending ? (
              <p className="text-sm text-muted-foreground">No held sales.</p>
            ) : null}
            {heldRows.map((row) => {
              const cust = Array.isArray(row.customers)
                ? row.customers[0]
                : row.customers
              const itemCount = (row.sale_items ?? []).reduce(
                (n, i) => n + Number(i.quantity),
                0
              )
              return (
                <div key={row.id} className="rounded-xl border p-3 text-sm">
                  <p className="font-medium">
                    {cust ? customerName(cust) : "Walk-in"} · {itemCount} items
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDisplayDateTime(
                      row.held_at ?? row.created_at,
                      timezone
                    )}
                    {row.notes ? ` · ${row.notes}` : ""}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => resumeHeld(row.id)}
                    >
                      Resume
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => cancelHeld(row.id)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}


function CheckoutColumn(props: {
  pending: boolean
  walkInCustomer: WalkInCustomer | null
  customer: CustomerOption | null
  setCustomer: Dispatch<SetStateAction<CustomerOption | null>>
  customerQ: string
  setCustomerQ: Dispatch<SetStateAction<string>>
  customerResults: CustomerOption[]
  setCustomerResults: Dispatch<SetStateAction<CustomerOption[]>>
  showNewCustomer: boolean
  setShowNewCustomer: Dispatch<SetStateAction<boolean>>
  newFirst: string
  setNewFirst: Dispatch<SetStateAction<string>>
  newLast: string
  setNewLast: Dispatch<SetStateAction<string>>
  newPhone: string
  setNewPhone: Dispatch<SetStateAction<string>>
  notes: string
  setNotes: Dispatch<SetStateAction<string>>
  cart: CartLine[]
  setCart: Dispatch<SetStateAction<CartLine[]>>
  clearCart: () => void
  updateQty: (productId: string, quantity: number) => void
  updateDiscount: (productId: string, discountAmount: number) => void
  taxEnabled: boolean
  taxRate: number
  taxInclusive: boolean
  cashierMaxLineDiscountPercent: number
  maxDiscountPctUi: number
  totals: {
    merchandise: number
    discountTotal: number
    subtotal: number
    taxTotal: number
    grand: number
    discountWarn: boolean
  }
  displayGrand: number
  paymentLines: PaymentLine[]
  setPaymentLines: Dispatch<SetStateAction<PaymentLine[]>>
  paymentPreview: {
    applied: number
    change: number
    remaining: number
    covers: boolean
  }
  currencyCode: string
  currencyLocale: string
  onComplete: () => void
  onHold: () => void
  createCustomer: () => void
}) {
  const {
    pending,
    walkInCustomer,
    customer,
    setCustomer,
    customerQ,
    setCustomerQ,
    customerResults,
    setCustomerResults,
    showNewCustomer,
    setShowNewCustomer,
    newFirst,
    setNewFirst,
    newLast,
    setNewLast,
    newPhone,
    setNewPhone,
    notes,
    setNotes,
    cart,
    setCart,
    clearCart,
    updateQty,
    updateDiscount,
    taxEnabled,
    taxRate,
    taxInclusive,
    cashierMaxLineDiscountPercent,
    maxDiscountPctUi,
    totals,
    displayGrand,
    paymentLines,
    setPaymentLines,
    paymentPreview,
    currencyCode,
    currencyLocale,
    onComplete,
    onHold,
    createCustomer,
  } = props

  const cartQty = cart.reduce((n, l) => n + l.quantity, 0)
  const primaryPay = paymentLines[0] ?? INITIAL_PAYMENT_LINE
  const payMethods = (Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).slice(
    0,
    3
  )
  const draftOrderNo = `#${String(cart.length * 17 + cartQty * 3 + 120000).slice(-6)}`

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-3.5">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShoppingCart className="size-4" aria-hidden />
          </span>
          <h2 className="font-heading text-base font-semibold">Shopping Cart</h2>
        </div>
        <p className="text-sm font-semibold tabular-nums text-muted-foreground">
          {cart.length === 0 ? "Draft" : draftOrderNo}
        </p>
      </div>

      <div className="shrink-0 space-y-2 border-b px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
              Customer
            </p>
            <p className="truncate text-sm font-semibold">
              {customer ? customerName(customer) : "Walk-in Customer"}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 shrink-0"
            onClick={() => setShowNewCustomer((v) => !v)}
          >
            {showNewCustomer ? "Close" : "Add New"}
          </Button>
        </div>
        <div className="flex gap-1.5">
          {walkInCustomer ? (
            <Button
              type="button"
              size="sm"
              className="h-8"
              variant={customer?.is_walk_in ? "default" : "outline"}
              onClick={() =>
                setCustomer({
                  id: walkInCustomer.id,
                  first_name: walkInCustomer.first_name,
                  last_name: walkInCustomer.last_name,
                  phone: walkInCustomer.phone,
                  is_walk_in: true,
                })
              }
            >
              Walk-in
            </Button>
          ) : null}
          <Input
            className="h-8 flex-1 text-sm"
            value={customerQ}
            onChange={(e) => setCustomerQ(e.target.value)}
            placeholder="Search customer…"
            aria-label="Search customers"
          />
        </div>
        {customerResults.length > 0 ? (
          <ul className="max-h-20 overflow-auto rounded-lg border">
            {customerResults.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="w-full px-2.5 py-1.5 text-left text-sm hover:bg-muted/60"
                  onClick={() => {
                    setCustomer(c)
                    setCustomerQ("")
                    setCustomerResults([])
                  }}
                >
                  {customerName(c)}
                  {c.phone ? ` · ${c.phone}` : ""}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {showNewCustomer ? (
          <div className="grid grid-cols-2 gap-1.5 rounded-lg border p-2">
            <Input
              className="h-8"
              placeholder="First name"
              value={newFirst}
              onChange={(e) => setNewFirst(e.target.value)}
            />
            <Input
              className="h-8"
              placeholder="Last name"
              value={newLast}
              onChange={(e) => setNewLast(e.target.value)}
            />
            <Input
              className="col-span-2 h-8"
              placeholder="Phone"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
            />
            <Button
              type="button"
              size="sm"
              className="col-span-2 h-8"
              disabled={pending || !newFirst.trim()}
              onClick={createCustomer}
            >
              Save customer
            </Button>
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {cart.length === 0 ? (
          <div className="flex h-full min-h-40 flex-col items-center justify-center text-center">
            <ShoppingCart
              className="mb-2 size-8 text-muted-foreground/40"
              aria-hidden
            />
            <p className="text-sm font-medium">Cart is empty</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Tap products to add them here
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {cart.map((line) => {
              const lineTotal = previewLineTax({
                qty: line.quantity,
                unitPrice: line.unitPrice,
                discount: line.discountAmount,
                taxEnabled,
                taxRate,
                taxInclusive,
              }).total
              return (
                <li key={line.productId} className="flex gap-3">
                  <ProductThumbnail
                    src={line.imageUrl}
                    alt=""
                    size="pos"
                    className="rounded-xl"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="line-clamp-2 text-sm font-medium leading-snug">
                        {line.name}
                      </p>
                      <button
                        type="button"
                        className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                        onClick={() =>
                          setCart((prev) =>
                            prev.filter((l) => l.productId !== line.productId)
                          )
                        }
                        aria-label={`Remove ${line.name}`}
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </button>
                    </div>
                    <p className="mt-0.5 text-sm font-semibold text-primary tabular-nums">
                      {formatCurrency(lineTotal, currencyCode, currencyLocale)}
                    </p>
                    <div className="mt-2 flex items-center gap-1.5">
                      <button
                        type="button"
                        className="flex size-7 items-center justify-center rounded-md border bg-background"
                        onClick={() =>
                          updateQty(line.productId, line.quantity - 1)
                        }
                        aria-label={`Decrease ${line.name}`}
                      >
                        <Minus className="size-3.5" />
                      </button>
                      <span className="w-7 text-center text-sm font-semibold tabular-nums">
                        {line.quantity}
                      </span>
                      <button
                        type="button"
                        className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground"
                        onClick={() =>
                          updateQty(line.productId, line.quantity + 1)
                        }
                        aria-label={`Increase ${line.name}`}
                      >
                        <Plus className="size-3.5" />
                      </button>
                      <Input
                        className="ml-auto h-7 w-16 text-xs"
                        inputMode="decimal"
                        placeholder="Disc"
                        value={
                          line.discountAmount ? String(line.discountAmount) : ""
                        }
                        onChange={(e) =>
                          updateDiscount(
                            line.productId,
                            Number(e.target.value) || 0
                          )
                        }
                        aria-label={`Discount for ${line.name}`}
                      />
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="shrink-0 space-y-3 border-t px-4 py-3">
        <div className="flex gap-2">
          <Input
            className="h-10 flex-1"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Coupon / sale notes"
            aria-label="Sale notes"
          />
          <Button type="button" size="icon" className="size-10 shrink-0" disabled>
            <ArrowRight className="size-4" />
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {payMethods.map((m) => (
            <button
              key={m}
              type="button"
              className={cn(
                "h-9 rounded-lg border text-xs font-semibold transition",
                primaryPay.method === m
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-card text-foreground hover:bg-muted"
              )}
              onClick={() =>
                setPaymentLines([
                  {
                    ...primaryPay,
                    method: m,
                    amount: "",
                    tendered: m === "cash" ? primaryPay.tendered : "",
                  },
                ])
              }
            >
              {PAYMENT_METHOD_LABELS[m]}
            </button>
          ))}
        </div>

        {primaryPay.method === "cash" ? (
          <Input
            className="h-9"
            inputMode="decimal"
            value={primaryPay.tendered}
            onChange={(e) =>
              setPaymentLines([
                { ...primaryPay, tendered: e.target.value, amount: "" },
              ])
            }
            placeholder="Cash tendered"
            aria-label="Cash tendered"
          />
        ) : (
          <Input
            className="h-9"
            inputMode="decimal"
            value={primaryPay.amount}
            onChange={(e) =>
              setPaymentLines([
                { ...primaryPay, amount: e.target.value, tendered: "" },
              ])
            }
            placeholder="Amount (blank = full total)"
            aria-label="Payment amount"
          />
        )}

        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between gap-3 text-muted-foreground">
            <span>Subtotal</span>
            <span className="tabular-nums text-foreground">
              {formatCurrency(totals.merchandise, currencyCode, currencyLocale)}
            </span>
          </div>
          <div className="flex justify-between gap-3 text-muted-foreground">
            <span>Tax</span>
            <span className="tabular-nums text-foreground">
              {formatCurrency(totals.taxTotal, currencyCode, currencyLocale)}
            </span>
          </div>
          <div className="flex justify-between gap-3 text-muted-foreground">
            <span>Discount</span>
            <span className="tabular-nums text-foreground">
              {formatCurrency(totals.discountTotal, currencyCode, currencyLocale)}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-3 border-t pt-2">
            <span className="font-semibold">Total</span>
            <span className="font-heading text-xl font-bold tabular-nums">
              {formatCurrency(displayGrand, currencyCode, currencyLocale)}
            </span>
          </div>
        </div>

        {totals.discountWarn ? (
          <p className="text-[11px] text-amber-700 dark:text-amber-300">
            A line discount exceeds cashier max ({maxDiscountPctUi}%).
          </p>
        ) : null}

        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-11 shrink-0"
            disabled={pending || cart.length === 0}
            onClick={onHold}
            aria-label="Hold sale"
          >
            <Pause className="size-4" aria-hidden />
          </Button>
          <Button
            type="button"
            className="h-11 flex-1 text-sm font-semibold"
            disabled={pending || displayGrand <= 0}
            aria-busy={pending}
            onClick={onComplete}
          >
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Submitting…
              </>
            ) : (
              "Submit Order"
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}


function PaymentPanel({
  pending,
  paymentLines,
  setPaymentLines,
  grand,
  merchandise,
  discountTotal,
  subtotal,
  taxTotal,
  paymentPreview,
  currencyCode,
  currencyLocale,
  onComplete,
  onHold,
  completeLabel,
  hideHold,
  maxDiscountPctUi,
  discountWarn,
}: {
  pending: boolean
  paymentLines: PaymentLine[]
  setPaymentLines: Dispatch<SetStateAction<PaymentLine[]>>
  grand: number
  merchandise: number
  discountTotal: number
  subtotal: number
  taxTotal: number
  paymentPreview: {
    applied: number
    change: number
    remaining: number
    covers: boolean
  }
  currencyCode: string
  currencyLocale: string
  onComplete: () => void
  onHold?: () => void
  completeLabel: string
  hideHold?: boolean
  maxDiscountPctUi: number
  discountWarn: boolean
}) {
  const split = paymentLines.length > 1
  const cashLine = !split ? paymentLines[0] : null
  const cashTendered =
    cashLine?.method === "cash" ? Number(cashLine.tendered) : NaN
  const cashChange =
    Number.isFinite(cashTendered) && cashTendered > 0
      ? roundMoney(cashTendered - grand)
      : null

  function updateLine(id: string, patch: Partial<PaymentLine>) {
    setPaymentLines((prev) =>
      prev.map((l) => (l.id === id ? { ...l, ...patch } : l))
    )
  }

  return (
    <div className="space-y-2">
      <dl className="space-y-0.5 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Subtotal</dt>
          <dd className="tabular-nums">
            {formatCurrency(merchandise, currencyCode, currencyLocale)}
          </dd>
        </div>
        {discountTotal > 0.001 ? (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Discount</dt>
            <dd className="tabular-nums text-amber-700 dark:text-amber-300">
              −{formatCurrency(discountTotal, currencyCode, currencyLocale)}
            </dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Tax</dt>
          <dd className="tabular-nums">
            {formatCurrency(taxTotal, currencyCode, currencyLocale)}
          </dd>
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-3 border-t pt-1.5">
          <dt className="text-sm font-semibold tracking-wide">TOTAL</dt>
          <dd className="font-heading text-xl font-semibold tracking-tight tabular-nums">
            {formatCurrency(grand, currencyCode, currencyLocale)}
          </dd>
        </div>
      </dl>
      <p className="text-[10px] leading-snug text-muted-foreground">
        Preview · cashier max discount {maxDiscountPctUi}%
      </p>
      {discountWarn ? (
        <p className="text-[11px] text-amber-700 dark:text-amber-300">
          One or more line discounts exceed the cashier maximum. Server will
          reject if you are not an owner/admin.
        </p>
      ) : null}

      <div className="space-y-1.5">
        <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
          Payment
        </p>
        {paymentLines.map((line, index) => (
          <div key={line.id} className="space-y-1.5 rounded-lg border p-2">
            <div className="flex items-end justify-between gap-2">
              <Field className="min-w-0 flex-1">
                <FieldLabel
                  htmlFor={`pay-method-${line.id}`}
                  className="text-xs"
                >
                  {split ? `Payment ${index + 1}` : "Method"}
                </FieldLabel>
                <select
                  id={`pay-method-${line.id}`}
                  className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm"
                  value={line.method}
                  onChange={(e) =>
                    updateLine(line.id, {
                      method: e.target.value as PaymentMethod,
                      amount: "",
                      tendered: "",
                    })
                  }
                >
                  {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map(
                    (m) => (
                      <option key={m} value={m}>
                        {PAYMENT_METHOD_LABELS[m]}
                      </option>
                    )
                  )}
                </select>
              </Field>
              {split ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9"
                  onClick={() =>
                    setPaymentLines((prev) =>
                      prev.filter((l) => l.id !== line.id)
                    )
                  }
                >
                  Remove
                </Button>
              ) : null}
            </div>

            {line.method === "cash" ? (
              <div className={cn("grid gap-2", split && "sm:grid-cols-2")}>
                <Field>
                  <FieldLabel
                    htmlFor={`tendered-${line.id}`}
                    className="text-xs"
                  >
                    {split ? "Cash tendered" : "Tendered"}
                  </FieldLabel>
                  <Input
                    id={`tendered-${line.id}`}
                    className="h-8"
                    inputMode="decimal"
                    value={line.tendered}
                    onChange={(e) =>
                      updateLine(line.id, { tendered: e.target.value })
                    }
                    placeholder={split ? "Optional if amount set" : "0.00"}
                  />
                </Field>
                {split ? (
                  <Field>
                    <FieldLabel
                      htmlFor={`amount-${line.id}`}
                      className="text-xs"
                    >
                      Amount
                    </FieldLabel>
                    <Input
                      id={`amount-${line.id}`}
                      className="h-8"
                      inputMode="decimal"
                      value={line.amount}
                      onChange={(e) =>
                        updateLine(line.id, { amount: e.target.value })
                      }
                      placeholder="Optional if tendered"
                    />
                  </Field>
                ) : null}
              </div>
            ) : (
              <Field>
                <FieldLabel htmlFor={`amount-${line.id}`} className="text-xs">
                  {split ? "Amount" : "Amount (defaults to total)"}
                </FieldLabel>
                <Input
                  id={`amount-${line.id}`}
                  className="h-8"
                  inputMode="decimal"
                  value={line.amount}
                  onChange={(e) =>
                    updateLine(line.id, { amount: e.target.value })
                  }
                  placeholder={
                    split
                      ? "Required"
                      : formatCurrency(grand, currencyCode, currencyLocale)
                  }
                />
              </Field>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() =>
            setPaymentLines((prev) => [...prev, newPaymentLine("card")])
          }
        >
          Add payment
        </Button>
        {split ? (
          <p className="text-xs text-muted-foreground">
            Applied{" "}
            {formatCurrency(paymentPreview.applied, currencyCode, currencyLocale)}
            {paymentPreview.remaining > 0.001
              ? ` · remaining ${formatCurrency(paymentPreview.remaining, currencyCode, currencyLocale)}`
              : ""}
            {paymentPreview.change > 0
              ? ` · change ${formatCurrency(paymentPreview.change, currencyCode, currencyLocale)}`
              : ""}
          </p>
        ) : cashChange !== null ? (
          <p
            className={cn(
              "text-sm font-medium tabular-nums",
              cashChange >= 0
                ? "text-emerald-700 dark:text-emerald-400"
                : "text-destructive"
            )}
          >
            {cashChange >= 0 ? "Change " : "Short "}
            {formatCurrency(Math.abs(cashChange), currencyCode, currencyLocale)}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5 pt-0.5">
        <Button
          type="button"
          size="lg"
          className="btn-h h-10 w-full text-sm font-semibold"
          disabled={pending || grand <= 0}
          onClick={onComplete}
          aria-busy={pending}
        >
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Completing sale…
            </>
          ) : (
            completeLabel
          )}
        </Button>
        {!hideHold && onHold ? (
          <Button
            type="button"
            variant="ghost"
            className="h-8 text-muted-foreground"
            disabled={pending}
            onClick={onHold}
          >
            <Pause className="size-3.5" aria-hidden />
            Hold sale
          </Button>
        ) : null}
      </div>
    </div>
  )
}

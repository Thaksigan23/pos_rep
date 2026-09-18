"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { canAccess, canPerform } from "@/lib/auth/permissions"
import { requireWorkspaceSession } from "@/lib/auth/workspace"
import {
  salePath,
  saleReceiptPath,
  saleRefundPath,
} from "@/lib/navigation/feature-paths"
import { APP_ROUTES } from "@/lib/navigation/paths"
import { mapSaleRpcError, type PaymentMethod } from "@/lib/sales/constants"
import {
  computeHeldSaleGrandTotal,
  computeSaleGrandTotal,
  findPosProductByBarcode,
  getHeldSaleForResume,
  listHeldSales,
  searchPosProducts,
} from "@/features/sales/queries"
import { createClient } from "@/lib/supabase/server"
import type { Json } from "@/types/database"

export type ActionResult =
  | { error: string }
  | {
      success?: string
      id?: string
      saleNumber?: string | null
      total?: number
      changeAmount?: number
    }

const paymentMethods = z.enum(["cash", "card", "bank_transfer", "other"])

const cartItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().positive(),
  discountAmount: z.number().min(0).optional(),
})

const paymentSchema = z.object({
  method: paymentMethods,
  amount: z.number().positive().optional(),
  tenderedAmount: z.number().positive().optional(),
})

const paymentsField = z
  .array(paymentSchema)
  .min(1)
  .optional()

const completeSaleSchema = z
  .object({
    items: z.array(cartItemSchema).min(1),
    customerId: z.string().uuid().optional().nullable(),
    notes: z.string().trim().max(1000).optional().or(z.literal("")),
    payment: paymentSchema.optional(),
    payments: paymentsField,
    idempotencyKey: z.string().uuid(),
    discountAmount: z.number().min(0).optional(),
  })
  .refine((v) => Boolean(v.payments?.length || v.payment), {
    message: "At least one payment is required.",
  })

const holdSaleSchema = z.object({
  items: z.array(cartItemSchema).min(1),
  customerId: z.string().uuid().optional().nullable(),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
})

const completeHeldSchema = z
  .object({
    saleId: z.string().uuid(),
    payment: paymentSchema.optional(),
    payments: paymentsField,
    notes: z.string().trim().max(1000).optional().or(z.literal("")),
    idempotencyKey: z.string().uuid(),
    discountAmount: z.number().min(0).optional(),
  })
  .refine((v) => Boolean(v.payments?.length || v.payment), {
    message: "At least one payment is required.",
  })

const posCustomerSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().max(80).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
})

function normalizePayments(
  input: {
    payment?: {
      method: PaymentMethod
      amount?: number
      tenderedAmount?: number
    }
    payments?: {
      method: PaymentMethod
      amount?: number
      tenderedAmount?: number
    }[]
  }
) {
  if (input.payments?.length) return input.payments
  if (input.payment) return [input.payment]
  return []
}

function buildPaymentsPayload(
  payments: {
    method: PaymentMethod
    amount?: number
    tenderedAmount?: number
  }[],
  grand: number
): Json[] {
  const single = payments.length === 1
  return payments.map((payment) => {
    if (payment.method === "cash") {
      if (payment.tenderedAmount != null && payment.tenderedAmount > 0) {
        return {
          method: "cash",
          tendered_amount: payment.tenderedAmount,
          ...(payment.amount != null && payment.amount > 0
            ? { amount: payment.amount }
            : {}),
        }
      }
      if (payment.amount != null && payment.amount > 0) {
        return { method: "cash", amount: payment.amount }
      }
      if (single) {
        throw new Error("Cash tendered amount is required.")
      }
      throw new Error("Each cash payment needs tendered or amount.")
    }
    const amount = payment.amount ?? (single ? grand : undefined)
    if (amount == null || !(amount > 0)) {
      throw new Error("Non-cash payments require an amount.")
    }
    return { method: payment.method, amount }
  })
}

export async function searchPosProductsAction(q: string) {
  const session = await requireWorkspaceSession()
  if (!canAccess(session.role, "pos")) {
    return { error: "You cannot search POS products." } as const
  }
  try {
    const rows = await searchPosProducts(session.shop.id, q)
    return { rows } as const
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Search failed.",
    } as const
  }
}

export async function findPosProductByBarcodeAction(barcode: string) {
  const session = await requireWorkspaceSession()
  if (!canAccess(session.role, "pos")) {
    return { error: "You cannot scan products." } as const
  }
  try {
    const product = await findPosProductByBarcode(session.shop.id, barcode)
    return { product } as const
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Barcode lookup failed.",
    } as const
  }
}

export async function listHeldSalesAction() {
  const session = await requireWorkspaceSession()
  if (!canAccess(session.role, "pos")) {
    return { error: "You cannot list held sales." } as const
  }
  try {
    const rows = await listHeldSales(session.shop.id)
    return { rows } as const
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Could not load held sales.",
    } as const
  }
}

export async function getHeldSaleAction(saleId: string) {
  const session = await requireWorkspaceSession()
  if (!canAccess(session.role, "pos")) {
    return { error: "You cannot resume held sales." } as const
  }
  try {
    const sale = await getHeldSaleForResume(saleId)
    if (!sale || sale.shop_id !== session.shop.id) {
      return { error: "Held sale not found." } as const
    }
    const totals = await computeHeldSaleGrandTotal(saleId)
    return { sale, totals } as const
  } catch (e) {
    return {
      error: mapSaleRpcError(
        e instanceof Error ? e.message : "Could not load held sale."
      ),
    } as const
  }
}

export async function searchPosCustomersAction(q: string) {
  const session = await requireWorkspaceSession()
  if (!canAccess(session.role, "pos") && !canAccess(session.role, "customers")) {
    return { error: "You cannot search customers." } as const
  }

  const supabase = await createClient()
  const trimmed = q.trim()
  let query = supabase
    .from("customers")
    .select("id, first_name, last_name, phone, is_walk_in, customer_number")
    .eq("is_walk_in", false)
    .order("first_name")
    .limit(15)

  if (trimmed) {
    const pattern = `%${trimmed}%`
    query = query.or(
      `first_name.ilike.${pattern},last_name.ilike.${pattern},phone.ilike.${pattern},customer_number.ilike.${pattern}`
    )
  }

  const { data, error } = await query
  if (error) return { error: error.message } as const
  return { rows: data ?? [] } as const
}

export async function createPosCustomerAction(
  input: unknown
): Promise<ActionResult> {
  const session = await requireWorkspaceSession()
  if (
    !canPerform(session.role, "manageCustomers") &&
    !canAccess(session.role, "pos")
  ) {
    return { error: "You cannot create customers." }
  }

  const parsed = posCustomerSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check customer details." }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("create_customer", {
    p_payload: {
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName || "",
      phone: parsed.data.phone || null,
    },
  })

  if (error || !data) {
    return { error: mapSaleRpcError(error?.message ?? "Could not create customer.") }
  }

  revalidatePath(APP_ROUTES.customers)
  return { success: "Customer created.", id: data }
}

export async function completeSaleAction(input: unknown): Promise<ActionResult> {
  const session = await requireWorkspaceSession()
  if (!canPerform(session.role, "operatePos")) {
    return { error: "You cannot complete sales." }
  }

  const parsed = completeSaleSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check sale details." }
  }

  try {
    const { grand } = await computeSaleGrandTotal({
      shopId: session.shop.id,
      items: parsed.data.items.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        discountAmount: i.discountAmount,
      })),
      discountAmount: parsed.data.discountAmount,
    })

    let payments: Json[]
    try {
      payments = buildPaymentsPayload(
        normalizePayments(parsed.data),
        grand
      )
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Invalid payment." }
    }

    const supabase = await createClient()
    const payload: Json = {
      shop_id: session.shop.id,
      customer_id: parsed.data.customerId ?? null,
      notes: parsed.data.notes || null,
      discount_amount: parsed.data.discountAmount ?? 0,
      idempotency_key: parsed.data.idempotencyKey,
      items: parsed.data.items.map((item) => ({
        product_id: item.productId,
        quantity: item.quantity,
        discount_amount: item.discountAmount ?? 0,
      })),
      payments,
    }

    const { data: saleId, error } = await supabase.rpc("complete_sale", {
      p_payload: payload,
    })

    if (error || !saleId) {
      return { error: mapSaleRpcError(error?.message ?? "Could not complete sale.") }
    }

    const { data: sale } = await supabase
      .from("sales")
      .select("id, sale_number, total, change_amount")
      .eq("id", saleId)
      .maybeSingle()

    revalidatePath(APP_ROUTES.pos)
    revalidatePath(APP_ROUTES.sales)
    revalidatePath(salePath(saleId))

    return {
      success: "Sale completed.",
      id: saleId,
      saleNumber: sale?.sale_number ?? null,
      total: sale ? Number(sale.total) : grand,
      changeAmount: sale ? Number(sale.change_amount) : 0,
    }
  } catch (e) {
    return {
      error: mapSaleRpcError(
        e instanceof Error ? e.message : "Could not complete sale."
      ),
    }
  }
}

export async function holdSaleAction(input: unknown): Promise<ActionResult> {
  const session = await requireWorkspaceSession()
  if (!canPerform(session.role, "operatePos")) {
    return { error: "You cannot hold sales." }
  }

  const parsed = holdSaleSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check sale details." }
  }

  const supabase = await createClient()
  const { data: saleId, error } = await supabase.rpc("hold_sale", {
    p_payload: {
      shop_id: session.shop.id,
      customer_id: parsed.data.customerId ?? null,
      notes: parsed.data.notes || null,
      items: parsed.data.items.map((item) => ({
        product_id: item.productId,
        quantity: item.quantity,
        discount_amount: item.discountAmount ?? 0,
      })),
    },
  })

  if (error || !saleId) {
    return { error: mapSaleRpcError(error?.message ?? "Could not hold sale.") }
  }

  revalidatePath(APP_ROUTES.pos)
  revalidatePath(APP_ROUTES.sales)
  return { success: "Sale held.", id: saleId }
}

export async function completeHeldSaleAction(
  input: unknown
): Promise<ActionResult> {
  const session = await requireWorkspaceSession()
  if (!canPerform(session.role, "operatePos")) {
    return { error: "You cannot complete held sales." }
  }

  const parsed = completeHeldSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check payment details." }
  }

  try {
    const { grand, discountAmount } = await computeHeldSaleGrandTotal(
      parsed.data.saleId,
      parsed.data.discountAmount
    )

    let payments: Json[]
    try {
      payments = buildPaymentsPayload(
        normalizePayments(parsed.data),
        grand
      )
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Invalid payment." }
    }

    const supabase = await createClient()
    const { data: saleId, error } = await supabase.rpc("complete_held_sale", {
      p_sale_id: parsed.data.saleId,
      p_payload: {
        payments,
        notes: parsed.data.notes || null,
        discount_amount: discountAmount,
        idempotency_key: parsed.data.idempotencyKey,
      },
    })

    if (error || !saleId) {
      return {
        error: mapSaleRpcError(error?.message ?? "Could not complete held sale."),
      }
    }

    const { data: sale } = await supabase
      .from("sales")
      .select("id, sale_number, total, change_amount")
      .eq("id", saleId)
      .maybeSingle()

    revalidatePath(APP_ROUTES.pos)
    revalidatePath(APP_ROUTES.sales)
    revalidatePath(salePath(saleId))

    return {
      success: "Held sale completed.",
      id: saleId,
      saleNumber: sale?.sale_number ?? null,
      total: sale ? Number(sale.total) : grand,
      changeAmount: sale ? Number(sale.change_amount) : 0,
    }
  } catch (e) {
    return {
      error: mapSaleRpcError(
        e instanceof Error ? e.message : "Could not complete held sale."
      ),
    }
  }
}

export async function cancelSaleAction(input: {
  saleId: string
  reason: string
}): Promise<ActionResult> {
  const session = await requireWorkspaceSession()
  if (!canAccess(session.role, "sales") && !canAccess(session.role, "pos")) {
    return { error: "You cannot cancel sales." }
  }

  const reason = input.reason?.trim()
  if (!reason) return { error: "A cancellation reason is required." }

  const supabase = await createClient()
  const { error } = await supabase.rpc("cancel_sale", {
    p_sale_id: input.saleId,
    p_reason: reason,
  })

  if (error) return { error: mapSaleRpcError(error.message) }

  revalidatePath(APP_ROUTES.sales)
  revalidatePath(APP_ROUTES.pos)
  revalidatePath(salePath(input.saleId))
  return { success: "Sale cancelled." }
}

export async function refundSaleAction(input: {
  saleId: string
  reason: string
  method?: PaymentMethod
  items: {
    saleItemId: string
    quantity: number
    restockDisposition?: "restock" | "damaged" | "none"
  }[]
  idempotencyKey?: string
}): Promise<ActionResult> {
  const session = await requireWorkspaceSession()
  if (!canPerform(session.role, "refundSales")) {
    return { error: "Only owners and admins can refund sales." }
  }

  const reason = input.reason?.trim()
  if (!reason) return { error: "A refund reason is required." }
  if (!input.items?.length) return { error: "Select at least one item to refund." }

  const supabase = await createClient()
  const { data: refundId, error } = await supabase.rpc("refund_sale", {
    p_payload: {
      sale_id: input.saleId,
      reason,
      method: input.method ?? "cash",
      idempotency_key: input.idempotencyKey ?? crypto.randomUUID(),
      items: input.items.map((item) => ({
        sale_item_id: item.saleItemId,
        quantity: item.quantity,
        restock_disposition: item.restockDisposition ?? "restock",
      })),
    },
  })

  if (error || !refundId) {
    return { error: mapSaleRpcError(error?.message ?? "Could not refund sale.") }
  }

  revalidatePath(APP_ROUTES.sales)
  revalidatePath(salePath(input.saleId))
  revalidatePath(saleRefundPath(input.saleId))
  revalidatePath(saleReceiptPath(input.saleId))
  return { success: "Refund recorded.", id: refundId }
}

export async function voidSalePaymentAction(input: {
  paymentId: string
  reason: string
  saleId: string
}): Promise<ActionResult> {
  const session = await requireWorkspaceSession()
  if (!canPerform(session.role, "refundSales")) {
    return { error: "Only owners and admins can void payments." }
  }

  const reason = input.reason?.trim()
  if (!reason) return { error: "A void reason is required." }

  const supabase = await createClient()
  const { error } = await supabase.rpc("void_payment", {
    p_payment_id: input.paymentId,
    p_reason: reason,
  })

  if (error) return { error: mapSaleRpcError(error.message) }

  revalidatePath(salePath(input.saleId))
  revalidatePath(APP_ROUTES.sales)
  return { success: "Payment voided." }
}

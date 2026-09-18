"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"

import { canAccess, canPerform } from "@/lib/auth/permissions"
import { requireWorkspaceSession } from "@/lib/auth/workspace"
import { customerPath } from "@/lib/navigation/feature-paths"
import { APP_ROUTES } from "@/lib/navigation/paths"
import { createClient } from "@/lib/supabase/server"

const customerSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().max(80).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  alternatePhone: z.string().trim().max(40).optional().or(z.literal("")),
  email: z.string().trim().email().optional().or(z.literal("")),
  address: z.string().trim().max(240).optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
})

const deviceSchema = z.object({
  customerId: z.string().uuid(),
  deviceBrandId: z.string().uuid().optional().or(z.literal("")),
  deviceModelId: z.string().uuid().optional().or(z.literal("")),
  newBrandName: z.string().trim().max(80).optional().or(z.literal("")),
  newModelName: z.string().trim().max(80).optional().or(z.literal("")),
  deviceType: z.enum(["phone", "tablet", "laptop", "watch", "other"]).default("phone"),
  color: z.string().trim().max(40).optional().or(z.literal("")),
  storageCapacity: z.string().trim().max(40).optional().or(z.literal("")),
  imei: z.string().trim().max(32).optional().or(z.literal("")),
  serialNumber: z.string().trim().max(64).optional().or(z.literal("")),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
  modelLabel: z.string().trim().max(120).optional().or(z.literal("")),
})

export type ActionResult = { error: string } | { success: string; id?: string }

export async function createCustomerAction(input: unknown): Promise<ActionResult> {
  const session = await requireWorkspaceSession()
  if (!canPerform(session.role, "manageCustomers") && !canAccess(session.role, "customers")) {
    return { error: "You cannot create customers." }
  }

  const parsed = customerSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check customer details." }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("create_customer", {
    p_payload: {
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName || "",
      phone: parsed.data.phone || null,
      alternate_phone: parsed.data.alternatePhone || null,
      email: parsed.data.email || null,
      address: parsed.data.address || null,
      notes: parsed.data.notes || null,
    },
  })

  if (error || !data) {
    return { error: error?.message ?? "Could not create customer." }
  }

  revalidatePath(APP_ROUTES.customers)
  redirect(customerPath(data))
}

export async function updateCustomerAction(
  customerId: string,
  input: unknown
): Promise<ActionResult> {
  const session = await requireWorkspaceSession()
  if (!canPerform(session.role, "manageCustomers")) {
    return { error: "You cannot edit customers." }
  }

  const parsed = customerSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check customer details." }
  }

  const supabase = await createClient()
  const { data: existing } = await supabase
    .from("customers")
    .select("id, is_walk_in")
    .eq("id", customerId)
    .maybeSingle()

  if (!existing) {
    return { error: "Customer not found." }
  }
  if (existing.is_walk_in) {
    return { error: "Walk-in customer cannot be edited like a regular customer." }
  }

  const { error } = await supabase
    .from("customers")
    .update({
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName || "",
      phone: parsed.data.phone || null,
      alternate_phone: parsed.data.alternatePhone || null,
      email: parsed.data.email || null,
      address: parsed.data.address || null,
      notes: parsed.data.notes || null,
    })
    .eq("id", customerId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath(customerPath(customerId))
  revalidatePath(APP_ROUTES.customers)
  return { success: "Customer updated." }
}

export async function createDeviceAction(input: unknown): Promise<ActionResult> {
  const session = await requireWorkspaceSession()
  if (!canAccess(session.role, "customers") && !canAccess(session.role, "repairs")) {
    return { error: "You cannot add devices." }
  }

  const parsed = deviceSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check device details." }
  }

  const orgId = session.organization.id
  const supabase = await createClient()
  let brandId = parsed.data.deviceBrandId || null
  let modelId = parsed.data.deviceModelId || null

  if (parsed.data.newBrandName) {
    const { data: brand, error: brandError } = await supabase
      .from("device_brands")
      .insert({ name: parsed.data.newBrandName, organization_id: orgId })
      .select("id")
      .single()
    if (brandError || !brand) {
      return { error: brandError?.message ?? "Could not create brand." }
    }
    brandId = brand.id
  }

  if (parsed.data.newModelName) {
    if (!brandId) {
      return { error: "Choose or create a brand before adding a model." }
    }
    const { data: model, error: modelError } = await supabase
      .from("device_models")
      .insert({
        organization_id: orgId,
        device_brand_id: brandId,
        name: parsed.data.newModelName,
        device_type: parsed.data.deviceType,
      })
      .select("id")
      .single()
    if (modelError || !model) {
      return { error: modelError?.message ?? "Could not create model." }
    }
    modelId = model.id
  }

  const { data: device, error } = await supabase
    .from("customer_devices")
    .insert({
      organization_id: orgId,
      customer_id: parsed.data.customerId,
      device_model_id: modelId,
      device_type: parsed.data.deviceType,
      color: parsed.data.color || null,
      storage_capacity: parsed.data.storageCapacity || null,
      imei: parsed.data.imei || null,
      serial_number: parsed.data.serialNumber || null,
      notes: parsed.data.notes || null,
      model_label: parsed.data.modelLabel || null,
    })
    .select("id")
    .single()

  if (error || !device) {
    return { error: error?.message ?? "Could not add device." }
  }

  revalidatePath(customerPath(parsed.data.customerId))
  return { success: "Device added.", id: device.id }
}

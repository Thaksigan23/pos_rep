import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, ClipboardPlus } from "lucide-react"

import { PageHeader } from "@/components/app/page-header"
import { buttonVariants } from "@/components/ui/button"
import { RepairIntakeForm } from "@/features/repairs/components/repair-intake-form"
import {
  getCustomerDevices,
  listAssignableTechnicians,
  listIntakeCheckDefinitions,
} from "@/features/repairs/queries"
import { searchCustomers } from "@/features/customers/queries"
import { requirePageAccess } from "@/lib/auth/workspace"
import { canPerform } from "@/lib/auth/permissions"
import { displayName } from "@/lib/auth/labels"
import { APP_ROUTES, firstSearchParam } from "@/lib/navigation/paths"
import { createClient } from "@/lib/supabase/server"
import { DEVICE_TYPE_LABELS, type DeviceType } from "@/lib/repairs/constants"
import { cn } from "@/lib/utils"
import { forbidden } from "next/navigation"

export const metadata: Metadata = { title: "New repair" }

export default async function NewRepairPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requirePageAccess("repairs")
  if (!canPerform(session.role, "intakeRepairs")) forbidden()

  const params = await searchParams
  const customerId = firstSearchParam(params.customerId)
  const deviceId = firstSearchParam(params.deviceId)

  const [{ rows: customers }, technicians, intakeDefinitions] =
    await Promise.all([
      searchCustomers({ page: 1, includeWalkIn: false }),
      listAssignableTechnicians(session.shop.id),
      listIntakeCheckDefinitions(),
    ])

  // Load more customers for intake picker (first page may be enough for MVP)
  const supabase = await createClient()
  const { data: moreCustomers } = await supabase
    .from("customers")
    .select("id, first_name, last_name, phone, customer_number")
    .eq("is_walk_in", false)
    .order("created_at", { ascending: false })
    .limit(200)

  const customerOptions = (moreCustomers ?? customers).map((c) => ({
    id: c.id,
    label:
      displayName(c.first_name, c.last_name, "Customer") +
      (c.phone ? ` · ${c.phone}` : "") +
      ` (${c.customer_number})`,
  }))

  let devices: { id: string; label: string; customerId: string }[] = []
  if (customerId) {
    const rows = await getCustomerDevices(customerId)
    devices = rows.map((d) => {
      const model = Array.isArray(d.device_models)
        ? d.device_models[0]
        : d.device_models
      const brandRaw = model?.device_brands
      const brand = Array.isArray(brandRaw) ? brandRaw[0] : brandRaw
      const label =
        d.model_label ||
        (model?.name
          ? `${brand?.name ? `${brand.name} ` : ""}${model.name}`
          : DEVICE_TYPE_LABELS[d.device_type as DeviceType])
      return { id: d.id, label, customerId }
    })
  } else {
    const { data: allDevices } = await supabase
      .from("customer_devices")
      .select(
        "id, customer_id, model_label, device_type, device_models(name, device_brands(name))"
      )
      .order("created_at", { ascending: false })
      .limit(300)
    devices = (allDevices ?? []).map((d) => {
      const model = Array.isArray(d.device_models)
        ? d.device_models[0]
        : d.device_models
      const brandRaw = model?.device_brands
      const brand = Array.isArray(brandRaw) ? brandRaw[0] : brandRaw
      const label =
        d.model_label ||
        (model?.name
          ? `${brand?.name ? `${brand.name} ` : ""}${model.name}`
          : DEVICE_TYPE_LABELS[d.device_type as DeviceType])
      return { id: d.id, label, customerId: d.customer_id }
    })
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href={APP_ROUTES.repairs}
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "-ml-2 w-fit"
        )}
      >
        <ArrowLeft className="size-4" />
        Repairs
      </Link>
      <PageHeader
        eyebrow="Intake"
        title="New repair"
        description="Capture the customer, device, accessories, and reported issue."
        icon={ClipboardPlus}
      />
      <div className="rounded-2xl border bg-card p-6">
        <RepairIntakeForm
          customers={customerOptions}
          initialCustomerId={customerId}
          initialDeviceId={deviceId}
          devices={devices}
          technicians={technicians}
          intakeDefinitions={intakeDefinitions}
        />
      </div>
    </div>
  )
}

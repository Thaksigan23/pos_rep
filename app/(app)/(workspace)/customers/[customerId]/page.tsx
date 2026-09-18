import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Smartphone, Wrench } from "lucide-react"

import { PageHeader } from "@/components/app/page-header"
import { StatusBadge, type StatusTone } from "@/components/app/status-badge"
import { buttonVariants } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { CustomerForm } from "@/features/customers/components/customer-form"
import { DeviceForm } from "@/features/customers/components/device-form"
import {
  getCustomerDetail,
  listDeviceCatalog,
} from "@/features/customers/queries"
import { requirePageAccess } from "@/lib/auth/workspace"
import { displayName } from "@/lib/auth/labels"
import { formatCurrency } from "@/lib/money/currency"
import {
  customerPath,
  repairNewPath,
  repairPath,
} from "@/lib/navigation/feature-paths"
import { APP_ROUTES } from "@/lib/navigation/paths"
import {
  DEVICE_TYPE_LABELS,
  REPAIR_STATUS_LABELS,
  type DeviceType,
  type RepairStatus,
} from "@/lib/repairs/constants"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Customer" }

function repairStatusTone(status: RepairStatus): StatusTone {
  if (status === "cancelled") return "stop"
  if (
    status === "ready_for_pickup" ||
    status === "completed" ||
    status === "delivered"
  ) {
    return "ready"
  }
  if (
    status === "waiting_for_customer_approval" ||
    status === "waiting_for_parts"
  ) {
    return "wait"
  }
  return "info"
}

function deviceLabel(device: {
  model_label: string | null
  device_type: DeviceType
  device_models:
    | {
        name: string
        device_brands: { name: string } | { name: string }[] | null
      }
    | {
        name: string
        device_brands: { name: string } | { name: string }[] | null
      }[]
    | null
}) {
  if (device.model_label) return device.model_label
  const model = Array.isArray(device.device_models)
    ? device.device_models[0]
    : device.device_models
  const brandRaw = model?.device_brands
  const brand = Array.isArray(brandRaw) ? brandRaw[0] : brandRaw
  if (model?.name) {
    return brand?.name ? `${brand.name} ${model.name}` : model.name
  }
  return DEVICE_TYPE_LABELS[device.device_type]
}

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ customerId: string }>
}) {
  const session = await requirePageAccess("customers")
  const { customerId } = await params
  const detail = await getCustomerDetail(customerId)
  if (!detail) notFound()

  const catalog = await listDeviceCatalog()
  const balanceByRepair = new Map(
    detail.balances.map((b) => [b.repairId, b])
  )
  const { currencyCode, currencyLocale } = session.shopSettings
  const name = displayName(
    detail.customer.first_name,
    detail.customer.last_name,
    "Customer"
  )
  const contactLine = [detail.customer.phone, detail.customer.email]
    .filter(Boolean)
    .join(" · ")

  return (
    <div className="page-stack">
      <Link
        href={APP_ROUTES.customers}
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "-ml-2 w-fit"
        )}
      >
        <ArrowLeft className="size-4" />
        Customers
      </Link>

      <PageHeader
        eyebrow={detail.customer.customer_number}
        title={name}
        description={contactLine || "No phone or email on file"}
        actions={
          <Link
            href={repairNewPath({ customerId })}
            className={cn(buttonVariants(), "btn-h h-10 px-4")}
          >
            <Wrench className="size-4" />
            New repair
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel panel-pad">
          <h2 className="font-heading text-lg">Profile</h2>
          <div className="mt-4">
            {detail.customer.is_walk_in ? (
              <p className="text-sm text-muted-foreground">
                Walk-in customer cannot be edited like a regular profile.
              </p>
            ) : (
              <CustomerForm
                mode="edit"
                customerId={customerId}
                defaults={{
                  firstName: detail.customer.first_name,
                  lastName: detail.customer.last_name,
                  phone: detail.customer.phone ?? "",
                  alternatePhone: detail.customer.alternate_phone ?? "",
                  email: detail.customer.email ?? "",
                  address: detail.customer.address ?? "",
                  notes: detail.customer.notes ?? "",
                }}
              />
            )}
          </div>
        </section>

        <section className="panel panel-pad">
          <div className="flex items-center gap-2">
            <Smartphone className="size-4 text-muted-foreground" />
            <h2 className="font-heading text-lg">Devices</h2>
          </div>
          <ul className="mt-4 space-y-3">
            {detail.devices.length === 0 ? (
              <li className="text-sm text-muted-foreground">No devices yet.</li>
            ) : (
              detail.devices.map((device) => (
                <li
                  key={device.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-border/80 px-3 py-2"
                >
                  <div>
                    <p className="font-medium">{deviceLabel(device)}</p>
                    <p className="text-xs text-muted-foreground">
                      {[device.imei && `IMEI ${device.imei}`, device.color]
                        .filter(Boolean)
                        .join(" · ") || DEVICE_TYPE_LABELS[device.device_type]}
                    </p>
                  </div>
                  <Link
                    href={repairNewPath({ customerId, deviceId: device.id })}
                    className={cn(
                      buttonVariants({ variant: "outline", size: "sm" })
                    )}
                  >
                    Repair
                  </Link>
                </li>
              ))
            )}
          </ul>
          <div className="mt-6 border-t pt-6">
            <h3 className="mb-3 text-sm font-medium">Add device</h3>
            <DeviceForm
              customerId={customerId}
              brands={catalog.brands}
              models={catalog.models as {
                id: string
                name: string
                device_brand_id: string
                device_type: DeviceType
              }[]}
            />
          </div>
        </section>
      </div>

      <section className="panel panel-pad">
        <h2 className="font-heading text-lg">Repair history</h2>
        {detail.repairs.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No repairs yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <Table className="table-dense">
              <TableHeader>
                <TableRow>
                  <TableHead>Ticket</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Issue</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.repairs.map((job) => {
                  const bal = balanceByRepair.get(job.id)
                  const status = job.status as RepairStatus
                  return (
                    <TableRow key={job.id}>
                      <TableCell>
                        <Link
                          href={repairPath(job.id)}
                          className="font-mono text-xs underline-offset-4 hover:underline"
                        >
                          {job.ticket_number}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={repairStatusTone(status)}>
                          {REPAIR_STATUS_LABELS[status]}
                        </StatusBadge>
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-sm">
                        {job.reported_issue}
                      </TableCell>
                      <TableCell className="money-cell">
                        {formatCurrency(
                          bal?.outstanding ?? 0,
                          currencyCode,
                          currencyLocale
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <p className="sr-only">{customerPath(customerId)}</p>
    </div>
  )
}

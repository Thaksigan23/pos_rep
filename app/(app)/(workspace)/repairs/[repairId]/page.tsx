import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Wrench } from "lucide-react"

import { PageHeader } from "@/components/app/page-header"
import { StatusBadge, type StatusTone } from "@/components/app/status-badge"
import { buttonVariants } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { RepairDetailsEditor } from "@/features/repairs/components/repair-details-editor"
import { RepairEstimatesPanel } from "@/features/repairs/components/repair-estimates-panel"
import { RepairPartsPanel } from "@/features/repairs/components/repair-parts-panel"
import { RepairPaymentsPanel } from "@/features/repairs/components/repair-payments-panel"
import { RepairPhotosPanel } from "@/features/repairs/components/repair-photos-panel"
import { RepairStatusActions } from "@/features/repairs/components/repair-status-actions"
import {
  getRepairJobDetail,
  listAssignableTechnicians,
  listRepairServices,
  listShopProductsForParts,
} from "@/features/repairs/queries"
import { canAccess, canPerform } from "@/lib/auth/permissions"
import { displayName } from "@/lib/auth/labels"
import { requirePageAccess } from "@/lib/auth/workspace"
import { formatCurrency } from "@/lib/money/currency"
import { formatDisplayDate } from "@/lib/datetime/format"
import { customerPath } from "@/lib/navigation/feature-paths"
import { APP_ROUTES } from "@/lib/navigation/paths"
import {
  ACCESSORY_LABELS,
  INTAKE_RESULT_LABELS,
  REPAIR_PRIORITY_LABELS,
  REPAIR_STATUS_LABELS,
  type AccessoryType,
  type EstimateStatus,
  type IntakeCheckResult,
  type PaymentMethod,
  type RepairPriority,
  type RepairStatus,
} from "@/lib/repairs/constants"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Repair detail" }

function statusTone(status: RepairStatus): StatusTone {
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

function intakeTone(result: IntakeCheckResult): StatusTone {
  if (result === "working") return "ready"
  if (result === "not_working") return "stop"
  if (result === "not_tested") return "wait"
  return "neutral"
}

export default async function RepairDetailPage({
  params,
}: {
  params: Promise<{ repairId: string }>
}) {
  const session = await requirePageAccess("repairs")
  const { repairId } = await params
  const detail = await getRepairJobDetail(repairId, session.role)
  if (!detail) notFound()

  const { job, payableTotal, paidTotal, outstanding } = detail
  const { currencyCode, currencyLocale } = session.shopSettings
  const canManagePhotos = canAccess(session.role, "repairs")

  const [technicians, services, products] = await Promise.all([
    listAssignableTechnicians(job.shop_id),
    listRepairServices(),
    listShopProductsForParts(job.shop_id),
  ])

  const customer = Array.isArray(job.customers) ? job.customers[0] : job.customers
  const device = Array.isArray(job.customer_devices)
    ? job.customer_devices[0]
    : job.customer_devices
  const technician = Array.isArray(job.profiles) ? job.profiles[0] : job.profiles
  const deviceName =
    device?.model_label ||
    (Array.isArray(device?.device_models)
      ? device?.device_models[0]?.name
      : device?.device_models?.name) ||
    "—"

  const sortedIntake = [...detail.intakeChecks].sort((a, b) => {
    const aDef = Array.isArray(a.intake_check_definitions)
      ? a.intake_check_definitions[0]
      : a.intake_check_definitions
    const bDef = Array.isArray(b.intake_check_definitions)
      ? b.intake_check_definitions[0]
      : b.intake_check_definitions
    return (aDef?.sort_order ?? 0) - (bDef?.sort_order ?? 0)
  })

  return (
    <div className="page-stack">
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

      <section className="panel panel-pad space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <PageHeader
            eyebrow="Repair job"
            title={job.ticket_number}
            description={job.reported_issue}
            icon={Wrench}
            badge={{
              label: REPAIR_STATUS_LABELS[job.status as RepairStatus],
              tone: statusTone(job.status as RepairStatus),
            }}
          />
          <div className="rounded-xl border bg-background/60 px-4 py-3 text-right">
            <p className="text-xs text-muted-foreground">Outstanding</p>
            <p className="font-heading text-xl tabular-nums">
              {formatCurrency(outstanding, currencyCode, currencyLocale)}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Paid {formatCurrency(paidTotal, currencyCode, currencyLocale)} of{" "}
              {formatCurrency(payableTotal, currencyCode, currencyLocale)}
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border bg-background/60 p-3">
            <p className="text-xs text-muted-foreground">Customer</p>
            {customer ? (
              <Link
                href={customerPath(customer.id)}
                className="font-medium underline-offset-4 hover:underline"
              >
                {displayName(
                  customer.first_name,
                  customer.last_name,
                  "Customer"
                )}
              </Link>
            ) : (
              <p className="font-medium">—</p>
            )}
            <p className="text-sm text-muted-foreground">{customer?.phone}</p>
          </div>
          <div className="rounded-xl border bg-background/60 p-3">
            <p className="text-xs text-muted-foreground">Device</p>
            <p className="font-medium">{deviceName}</p>
            <p className="text-sm text-muted-foreground">
              {device?.imei ? `IMEI ${device.imei}` : "No IMEI"}
            </p>
          </div>
          <div className="rounded-xl border bg-background/60 p-3">
            <p className="text-xs text-muted-foreground">Technician</p>
            <p className="font-medium">
              {technician
                ? displayName(
                    technician.first_name,
                    technician.last_name,
                    "Technician"
                  )
                : "Unassigned"}
            </p>
            <p className="text-sm text-muted-foreground">
              {REPAIR_PRIORITY_LABELS[job.priority as RepairPriority]} priority
            </p>
          </div>
          <div className="rounded-xl border bg-background/60 p-3">
            <p className="text-xs text-muted-foreground">Dates</p>
            <p className="font-medium">
              Created{" "}
              {formatDisplayDate(
                job.created_at,
                session.shopSettings.timezone
              )}
            </p>
            <p className="text-sm text-muted-foreground">
              {job.estimated_completion_date
                ? `Due ${formatDisplayDate(
                    job.estimated_completion_date,
                    session.shopSettings.timezone
                  )}`
                : "No ETA"}
            </p>
          </div>
        </div>
      </section>

      <Tabs defaultValue="status" className="space-y-4">
        <div className="-mx-1 overflow-x-auto px-1">
          <TabsList className="inline-flex h-auto w-max min-w-full justify-start gap-1 bg-muted/40 p-1">
            <TabsTrigger value="status" className="shrink-0">
              Status
            </TabsTrigger>
            <TabsTrigger value="details" className="shrink-0">
              Details
            </TabsTrigger>
            <TabsTrigger value="estimates" className="shrink-0">
              Estimates
            </TabsTrigger>
            <TabsTrigger value="parts" className="shrink-0">
              Parts
            </TabsTrigger>
            <TabsTrigger value="photos" className="shrink-0">
              Photos
            </TabsTrigger>
            <TabsTrigger value="payments" className="shrink-0">
              Payments
            </TabsTrigger>
            <TabsTrigger value="history" className="shrink-0">
              History
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="status" className="panel panel-pad mt-0">
          <h2 className="mb-3 font-heading text-lg">Status actions</h2>
          <RepairStatusActions
            repairId={repairId}
            status={job.status as RepairStatus}
            canCancel={
              canPerform(session.role, "exceptionalRepairCancel") ||
              session.role === "cashier"
            }
          />
        </TabsContent>

        <TabsContent value="details" className="mt-0 space-y-4">
          <section className="panel panel-pad">
            <h2 className="mb-1 font-heading text-lg">Overview & notes</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Diagnosis, assignment, and internal notes for this job.
            </p>
            <RepairDetailsEditor
              repairId={repairId}
              role={session.role}
              technicians={technicians}
              defaults={{
                diagnosis: job.diagnosis,
                technician_notes: job.technician_notes,
                internal_notes: job.internal_notes,
                assigned_technician_id: job.assigned_technician_id,
                priority: job.priority as RepairPriority,
                estimated_completion_date: job.estimated_completion_date,
                device_condition: job.device_condition,
              }}
            />
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="panel panel-pad">
              <h2 className="mb-1 font-heading text-lg">Accessories received</h2>
              <p className="mb-3 text-sm text-muted-foreground">
                Items recorded at intake.
              </p>
              {detail.accessories.length === 0 ? (
                <p className="text-sm text-muted-foreground">None recorded.</p>
              ) : (
                <ul className="space-y-2">
                  {detail.accessories.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
                    >
                      <span>
                        {ACCESSORY_LABELS[a.accessory_type as AccessoryType]}
                      </span>
                      <StatusBadge tone={a.present ? "ready" : "neutral"}>
                        {a.present ? "Present" : "Not present"}
                      </StatusBadge>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="panel panel-pad">
              <h2 className="mb-1 font-heading text-lg">Intake condition</h2>
              <p className="mb-3 text-sm text-muted-foreground">
                Checklist results from device intake.
              </p>
              {sortedIntake.length === 0 ? (
                <p className="text-sm text-muted-foreground">No checks recorded.</p>
              ) : (
                <ul className="space-y-2">
                  {sortedIntake.map((c) => {
                    const def = Array.isArray(c.intake_check_definitions)
                      ? c.intake_check_definitions[0]
                      : c.intake_check_definitions
                    const result = c.result as IntakeCheckResult
                    return (
                      <li
                        key={c.id}
                        className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
                      >
                        <span className="min-w-0">
                          <span className="font-medium">
                            {def?.label ?? "Check"}
                          </span>
                          {c.notes ? (
                            <span className="mt-0.5 block text-xs text-muted-foreground">
                              {c.notes}
                            </span>
                          ) : null}
                        </span>
                        <StatusBadge tone={intakeTone(result)}>
                          {INTAKE_RESULT_LABELS[result]}
                        </StatusBadge>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          </div>
        </TabsContent>

        <TabsContent value="estimates" className="panel panel-pad mt-0">
          <RepairEstimatesPanel
            repairId={repairId}
            estimates={detail.estimates as {
              id: string
              version: number
              status: EstimateStatus
              subtotal: number
              tax_amount: number
              discount_amount: number
              total: number
              notes: string | null
              estimate_number: string
              repair_estimate_items: {
                id: string
                line_type: string
                description_snapshot: string
                quantity: number
                unit_price: number
                line_total: number
              }[] | null
            }[]}
            services={services}
            products={products.map((p) => ({
              id: p.id,
              name: p.name,
              sku: p.sku,
            }))}
            currencyCode={currencyCode}
            currencyLocale={currencyLocale}
            canSend={canPerform(session.role, "sendEstimates")}
          />
        </TabsContent>

        <TabsContent value="parts" className="panel panel-pad mt-0">
          <RepairPartsPanel
            repairId={repairId}
            parts={detail.parts as never}
            products={products as never}
            currencyCode={currencyCode}
            currencyLocale={currencyLocale}
            canConsume={canPerform(session.role, "consumeRepairParts")}
            canViewCost={canPerform(session.role, "viewCostPrices")}
          />
        </TabsContent>

        <TabsContent value="photos" className="panel panel-pad mt-0">
          <h2 className="mb-1 font-heading text-lg">Repair photos</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Service documentation for intake and progress.
          </p>
          <RepairPhotosPanel
            repairId={repairId}
            photos={detail.photos}
            photoUrls={detail.photoUrls}
            canManage={canManagePhotos}
          />
        </TabsContent>

        <TabsContent value="payments" className="panel panel-pad mt-0">
          <RepairPaymentsPanel
            repairId={repairId}
            outstanding={outstanding}
            payableTotal={payableTotal}
            paidTotal={paidTotal}
            payments={detail.payments as {
              id: string
              amount: number
              method: PaymentMethod
              notes: string | null
              created_at: string
              voided_at: string | null
              tendered_amount: number | null
              change_amount: number
              entry_type: string
            }[]}
            currencyCode={currencyCode}
            currencyLocale={currencyLocale}
            canTakePayments={canPerform(session.role, "takePayments")}
          />
        </TabsContent>

        <TabsContent value="history" className="panel panel-pad mt-0">
          <h2 className="mb-1 font-heading text-lg">Status history</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Timeline of status changes for this job.
          </p>
          {detail.history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No history yet.</p>
          ) : (
            <ol className="relative space-y-0 border-l border-border pl-5">
              {detail.history.map((h, index) => (
                <li key={h.id} className="relative pb-5 last:pb-0">
                  <span
                    className={cn(
                      "absolute top-1.5 -left-[1.4rem] size-2.5 rounded-full border-2 border-background",
                      index === detail.history.length - 1
                        ? "bg-primary"
                        : "bg-muted-foreground/40"
                    )}
                    aria-hidden
                  />
                  <p className="text-sm font-medium">
                    {h.previous_status
                      ? `${REPAIR_STATUS_LABELS[h.previous_status as RepairStatus]} → `
                      : ""}
                    {REPAIR_STATUS_LABELS[h.new_status as RepairStatus]}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(h.created_at).toLocaleString()}
                    {h.note ? ` · ${h.note}` : ""}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

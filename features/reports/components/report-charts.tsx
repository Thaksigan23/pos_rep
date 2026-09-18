"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import type { ReportSummary } from "@/features/reports/queries"
import { formatDisplayDate } from "@/lib/datetime/format"
import { PAYMENT_METHOD_LABELS } from "@/lib/repairs/constants"
import { formatCurrency } from "@/lib/money/currency"

const STROKE = "var(--foreground)"
const FILL_MUTED = "var(--muted-foreground)"
const GRID = "var(--border)"
const PIE_COLORS = [
  "var(--foreground)",
  "var(--muted-foreground)",
  "color-mix(in oklch, var(--muted-foreground) 70%, transparent)",
  "color-mix(in oklch, var(--muted-foreground) 45%, transparent)",
]

function ChartEmpty({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="muted-sm">{message}</p>
    </div>
  )
}

function SalesOverTimeChart({
  salesData,
  money,
}: {
  salesData: { day: string; revenue: number }[]
  money: (n: number) => string
}) {
  if (salesData.length === 0) {
    return <ChartEmpty message="No sales in range." />
  }

  // Single distinct day: compact bar — avoid a mostly-empty line chart.
  if (salesData.length === 1) {
    const point = salesData[0]!
    return (
      <div className="flex h-full flex-col justify-center gap-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-sm font-medium">{formatDisplayDate(point.day)}</p>
            <p className="muted-xs mt-0.5">One sales day in this range</p>
          </div>
          <p className="text-lg font-semibold tabular-nums tracking-tight">
            {money(point.revenue)}
          </p>
        </div>
        <div className="h-36 w-full max-w-sm">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={salesData}
              margin={{ top: 8, right: 8, left: 4, bottom: 4 }}
            >
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} tickMargin={8} />
              <YAxis tick={{ fontSize: 11 }} width={56} />
              <Tooltip
                formatter={(value) => money(Number(value ?? 0))}
                labelFormatter={(label) => formatDisplayDate(String(label))}
              />
              <Bar
                dataKey="revenue"
                name="Revenue"
                fill={STROKE}
                radius={[4, 4, 0, 0]}
                maxBarSize={72}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={salesData}
        margin={{ top: 8, right: 12, left: 4, bottom: 4 }}
      >
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
        <XAxis dataKey="day" tick={{ fontSize: 11 }} tickMargin={8} />
        <YAxis tick={{ fontSize: 11 }} width={56} />
        <Tooltip
          formatter={(value) => money(Number(value ?? 0))}
          labelFormatter={(label) => formatDisplayDate(String(label))}
          labelClassName="text-xs"
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line
          type="monotone"
          dataKey="revenue"
          name="Revenue"
          stroke={STROKE}
          strokeWidth={2}
          dot
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

export function ReportCharts({
  summary,
  currencyCode,
  currencyLocale,
}: {
  summary: ReportSummary
  currencyCode: string
  currencyLocale: string
}) {
  const money = (n: number) => formatCurrency(n, currencyCode, currencyLocale)

  const salesData = summary.sales_over_time.map((d) => ({
    day: d.day,
    revenue: d.revenue,
  }))

  const expenseData = summary.expenses_over_time.map((d) => ({
    day: d.day,
    total: d.total,
  }))

  const paymentData = [
    { name: PAYMENT_METHOD_LABELS.cash, value: summary.payments.cash },
    { name: PAYMENT_METHOD_LABELS.card, value: summary.payments.card },
    {
      name: PAYMENT_METHOD_LABELS.bank_transfer,
      value: summary.payments.bank_transfer,
    },
    { name: PAYMENT_METHOD_LABELS.other, value: summary.payments.other },
  ].filter((d) => d.value > 0)

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="panel panel-pad lg:col-span-2">
        <p className="section-label">Sales over time</p>
        <div
          className={
            salesData.length === 1 ? "mt-4 h-52" : "mt-4 h-72"
          }
        >
          <SalesOverTimeChart salesData={salesData} money={money} />
        </div>
      </section>

      <section className="panel panel-pad">
        <p className="section-label">Expenses over time</p>
        <div className="mt-4 h-60">
          {expenseData.length === 0 ? (
            <ChartEmpty message="No expenses in range." />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={expenseData}
                margin={{ top: 8, right: 8, left: 4, bottom: 4 }}
              >
                <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} tickMargin={8} />
                <YAxis tick={{ fontSize: 11 }} width={56} />
                <Tooltip
                  formatter={(value) => money(Number(value ?? 0))}
                  labelFormatter={(label) => formatDisplayDate(String(label))}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar
                  dataKey="total"
                  name="Expenses"
                  fill={FILL_MUTED}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section className="panel panel-pad">
        <p className="section-label">Payment methods</p>
        <div className="mt-4 h-60">
          {paymentData.length === 0 ? (
            <ChartEmpty message="No receipts in range." />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                <Pie
                  data={paymentData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={48}
                  outerRadius={72}
                  paddingAngle={2}
                >
                  {paymentData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => money(Number(value ?? 0))} />
                <Legend
                  wrapperStyle={{ fontSize: 12 }}
                  verticalAlign="bottom"
                  height={36}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>
    </div>
  )
}

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { EarningsSlice } from "@/features/reports/queries"

const ROWS: { key: keyof Pick<
  EarningsSlice,
  "sales" | "repairs" | "total" | "expenses" | "net"
>; label: string }[] = [
  { key: "sales", label: "Sales" },
  { key: "repairs", label: "Repairs" },
  { key: "total", label: "Sales + repairs" },
  { key: "expenses", label: "Expenses" },
  { key: "net", label: "After expenses" },
]

export function EarningsBoard({
  periods,
  money,
}: {
  periods: EarningsSlice[]
  money: (amount: number) => string
}) {
  return (
    <section className="panel overflow-hidden">
      <div className="panel-pad pb-2">
        <p className="section-label">Revenue and expenses</p>
        <p className="muted-xs mt-1">
          Sales are completed sale totals minus refunds. Repairs are payments
          collected. Sales + repairs adds those two. Overall is all time.
        </p>
      </div>
      <div className="overflow-x-auto">
        <Table className="table-dense">
          <TableHeader>
            <TableRow>
              <TableHead> </TableHead>
              {periods.map((period) => (
                <TableHead key={period.key} className="text-right">
                  {period.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {ROWS.map((row) => (
              <TableRow key={row.key}>
                <TableCell
                  className={
                    row.key === "total" || row.key === "net"
                      ? "font-medium"
                      : "text-muted-foreground"
                  }
                >
                  {row.label}
                </TableCell>
                {periods.map((period) => (
                  <TableCell
                    key={period.key}
                    className={
                      row.key === "total" || row.key === "net"
                        ? "money-cell font-medium"
                        : "money-cell"
                    }
                  >
                    {money(period[row.key])}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}

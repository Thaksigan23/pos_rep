export function formatCurrency(
  amount: number | string | null | undefined,
  currencyCode: string,
  locale: string
): string {
  const value = typeof amount === "string" ? Number(amount) : amount ?? 0
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0)
}

export function roundMoney(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100
}

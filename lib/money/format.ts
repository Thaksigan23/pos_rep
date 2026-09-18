import {
  DEFAULT_FRACTION_DIGITS,
  minorToDecimalString,
  type MoneyFormatOptions,
} from "@/lib/money/calc"

export function formatMoney(
  minor: bigint,
  options: MoneyFormatOptions
): string {
  const fractionDigits = options.fractionDigits ?? DEFAULT_FRACTION_DIGITS
  const decimal = minorToDecimalString(minor, fractionDigits)

  return new Intl.NumberFormat(options.locale, {
    style: "currency",
    currency: options.currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(Number(decimal))
}

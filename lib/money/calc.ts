export const DEFAULT_FRACTION_DIGITS = 2

const AMOUNT_PATTERN = /^-?\d+(\.\d+)?$/

export type MoneyFormatOptions = {
  currency: string
  locale: string
  fractionDigits?: number
}

export function parseToMinor(
  value: string,
  fractionDigits = DEFAULT_FRACTION_DIGITS
): bigint {
  const normalized = value.trim()

  if (!AMOUNT_PATTERN.test(normalized)) {
    throw new Error("Invalid monetary amount.")
  }

  const negative = normalized.startsWith("-")
  const unsigned = negative ? normalized.slice(1) : normalized
  const [wholeRaw, fractionRaw = ""] = unsigned.split(".")

  if (fractionRaw.length > fractionDigits) {
    throw new Error("Amount has too many decimal places.")
  }

  const paddedFraction = fractionRaw.padEnd(fractionDigits, "0")
  const scale = 10n ** BigInt(fractionDigits)
  const minor = BigInt(wholeRaw) * scale + BigInt(paddedFraction || "0")

  return negative ? -minor : minor
}

export function addMinor(...amounts: bigint[]): bigint {
  return amounts.reduce((sum, amount) => sum + amount, 0n)
}

export function subtractMinor(left: bigint, right: bigint): bigint {
  return left - right
}

export function multiplyMinorByQuantity(
  unitMinor: bigint,
  quantity: string,
  quantityScale = 3
): bigint {
  const quantityMinor = parseToMinor(quantity, quantityScale)
  const product = unitMinor * quantityMinor
  const divisor = 10n ** BigInt(quantityScale)
  const half = divisor / 2n

  if (product >= 0n) {
    return (product + half) / divisor
  }

  return (product - half) / divisor
}

export function minorToDecimalString(
  minor: bigint,
  fractionDigits = DEFAULT_FRACTION_DIGITS
): string {
  const negative = minor < 0n
  const absolute = negative ? -minor : minor
  const scale = 10n ** BigInt(fractionDigits)
  const whole = absolute / scale
  const fraction = (absolute % scale).toString().padStart(fractionDigits, "0")
  const formatted = fractionDigits === 0 ? `${whole}` : `${whole}.${fraction}`

  return negative ? `-${formatted}` : formatted
}

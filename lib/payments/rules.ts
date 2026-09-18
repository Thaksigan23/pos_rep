/**
 * Architectural payment rules for later phases. Do not implement payment UI here.
 *
 * Outstanding balance is always determined by the server/database, never the browser.
 * Ordinary non-cash receipts must not exceed the remaining balance.
 * Cash may exceed the total only when it represents tendered cash; change is not
 * revenue and is not stored as an extra payment.
 * Duplicate submissions stay idempotent. Overpayment must be an explicit cashier
 * action, never a silent extra receipt.
 */

export const PAYMENT_RULES = {
  outstandingSource: "server",
  nonCashMayExceedBalance: false,
  cashTenderMayExceedTotal: true,
  changeIsNotRevenue: true,
  submissionsAreIdempotent: true,
} as const

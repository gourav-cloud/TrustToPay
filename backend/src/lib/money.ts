/**
 * Money is stored and compared as integer minor units. These helpers never use
 * floating point arithmetic for financial values.
 */

export function isSupportedCurrency(currency: string): boolean {
  return currency === "USD";
}

export function formatMinorUnits(amountMinor: number, currency = "USD"): string {
  if (!Number.isInteger(amountMinor) || amountMinor < 0) {
    throw new Error("amountMinor must be a non-negative integer");
  }
  const major = Math.floor(amountMinor / 100);
  const minor = String(amountMinor % 100).padStart(2, "0");
  return `${major}.${minor} ${currency}`;
}

/** PayPal expects a decimal string such as "12.00". Derived without floats. */
export function toPayPalAmount(amountMinor: number): string {
  if (!Number.isInteger(amountMinor) || amountMinor < 0) {
    throw new Error("amountMinor must be a non-negative integer");
  }
  return `${Math.floor(amountMinor / 100)}.${String(amountMinor % 100).padStart(2, "0")}`;
}

/** Parse a provider decimal string ("12.00", "0.99") into integer minor units. */
export function parseProviderAmount(value: string): number {
  if (typeof value !== "string" || !/^\d+(\.\d{1,2})?$/.test(value)) {
    throw new Error(`Invalid provider amount: ${value}`);
  }
  const [whole, fraction = ""] = value.split(".");
  const padded = `${fraction}00`.slice(0, 2);
  return Number.parseInt(whole, 10) * 100 + Number.parseInt(padded, 10);
}

import { AppError } from "../utils/app-error.ts";

export type CheckoutProvider = "stripe" | "paymob";

export const PAYMOB_COUNTRY_CODES = ["EG", "SA", "OM", "AE"] as const;
const paymobCountries = new Set<string>(PAYMOB_COUNTRY_CODES);

export function paymentProvidersForCountry(country?: string, paymobConfigured = true): CheckoutProvider[] {
  return paymobConfigured && paymobCountries.has(String(country).toUpperCase()) ? ["stripe", "paymob"] : ["stripe"];
}

export function assertPaymentProviderAllowed(provider: CheckoutProvider, country?: string): void {
  if (provider === "paymob" && !paymobCountries.has(String(country).toUpperCase())) {
    throw new AppError(403, "PAYMOB_REGION_RESTRICTED", "Paymob is available only in Egypt, Saudi Arabia, Oman, and the United Arab Emirates");
  }
}

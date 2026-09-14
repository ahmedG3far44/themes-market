import env from "../config/env.ts";
import { AppError } from "../utils/app-error.ts";

interface PaymobIntentionInput {
  amountMinor: number;
  currency?: string;
  country: string;
  reference: string;
  successUrl: string;
  customer: { firstName: string; lastName?: string; email: string; phone?: string };
  items?: Array<{ name: string; amountMinor: number; quantity?: number; description?: string }>;
}

const supportedCountries = new Set(["EG", "SA", "OM", "AE"]);
const paymobBaseUrls: Record<string, string> = {
  EG: "https://accept.paymob.com",
  SA: "https://ksa.paymob.com",
  OM: "https://oman.paymob.com",
  AE: "https://uae.paymob.com",
};

export function parsePaymobIntegrationId(value: string): number | undefined {
  if (!/^\d+$/.test(value.trim())) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function paymobConfigurationIssue(country?: string): string | undefined {
  if (!country || !supportedCountries.has(country.toUpperCase())) return "Paymob is not available in your country";
  if (!env.PAYMOB_SECRET_KEY) return "PAYMOB_SECRET_KEY is missing";
  if (!env.PAYMOB_PUBLIC_KEY) return "PAYMOB_PUBLIC_KEY is missing";
  if (!parsePaymobIntegrationId(env.PAYMOB_INTEGRATION_ID)) return "PAYMOB_INTEGRATION_ID must be the numeric ID from Paymob Dashboard → Developers → Payment Integrations";
  return undefined;
}

function publicWebhookUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
    return url.protocol === "https:" && !local ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function paymobErrorMessage(value: unknown, path = ""): string[] {
  if (typeof value === "string" && value.trim()) return [`${path ? `${path}: ` : ""}${value.trim()}`];
  if (Array.isArray(value)) return value.flatMap((item) => paymobErrorMessage(item, path));
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => paymobErrorMessage(item, path ? `${path}.${key}` : key));
}

export function paymobCredentials(country: string) {
  const normalizedCountry = country.toUpperCase();
  if (!supportedCountries.has(normalizedCountry)) return undefined;
  return { secretKey: env.PAYMOB_SECRET_KEY, publicKey: env.PAYMOB_PUBLIC_KEY, integrationId: parsePaymobIntegrationId(env.PAYMOB_INTEGRATION_ID), baseUrl: paymobBaseUrls[normalizedCountry] };
}

export function convertUsdMinorToEgpMinor(usdMinor: number, rate = env.PAYMOB_USD_TO_EGP_RATE): number {
  if (!Number.isInteger(usdMinor) || usdMinor < 0) throw new Error("USD amount must be a non-negative integer in minor units");
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("USD to EGP exchange rate must be positive");
  return Math.round(usdMinor * rate);
}

export function isPaymobConfigured(country?: string): boolean {
  return !paymobConfigurationIssue(country);
}

export async function createPaymobIntention(input: PaymobIntentionInput) {
  const credentials = paymobCredentials(input.country);
  const configurationIssue = paymobConfigurationIssue(input.country);
  if (!credentials || configurationIssue) {
    throw new AppError(503, "PAYMOB_NOT_CONFIGURED", configurationIssue ?? `Paymob is not configured for ${input.country}`);
  }

  let response: Response;
  try {
    response = await fetch(`${credentials.baseUrl}/v1/intention/`, {
      method: "POST",
      headers: { Authorization: `Token ${credentials.secretKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: input.amountMinor,
        currency: input.currency ?? "EGP",
        payment_methods: [credentials.integrationId],
        items: (input.items ?? []).map((item) => ({ name: item.name, description: item.description, amount: item.amountMinor, quantity: item.quantity ?? 1 })),
        billing_data: {
          first_name: input.customer.firstName, last_name: input.customer.lastName ?? "Customer", email: input.customer.email,
          phone_number: input.customer.phone ?? "+201000000000", apartment: "NA", floor: "NA", street: "NA", building: "NA", city: "NA", country: input.country, state: "NA",
        },
        special_reference: input.reference,
        redirection_url: input.successUrl,
        notification_url: publicWebhookUrl(env.PAYMOB_WEBHOOK_URL),
        extras: { orderId: input.reference },
      }),
    });
  } catch {
    throw new AppError(502, "PAYMOB_UNAVAILABLE", "Paymob is temporarily unavailable. Please try again or use Stripe");
  }

  const data = await response.json().catch(() => ({})) as { id?: string; intention_order_id?: number | string; client_secret?: string; detail?: string; message?: string };
  if (!response.ok || !data.client_secret) {
    const detail = paymobErrorMessage(data).slice(0, 5).join("; ");
    throw new AppError(502, "PAYMOB_CHECKOUT_FAILED", detail || "Paymob could not start checkout. Verify the Integration ID mode and currency");
  }
  return { ...data, checkoutUrl: `${credentials.baseUrl}/unifiedcheckout/?publicKey=${encodeURIComponent(credentials.publicKey)}&clientSecret=${encodeURIComponent(data.client_secret)}` };
}

import { createHmac, timingSafeEqual } from "node:crypto";
import env from "../config/env.ts";
import { AppError } from "../utils/app-error.ts";

export interface PaymobLineItem {
  name: string;
  description?: string;
  unitAmountMinor: number;
  quantity?: number;
}

export interface PaymobTransaction {
  id?: number | string;
  pending?: boolean;
  amount_cents?: number;
  success?: boolean;
  is_auth?: boolean;
  is_capture?: boolean;
  is_standalone_payment?: boolean;
  is_voided?: boolean;
  is_refunded?: boolean;
  is_3d_secure?: boolean;
  integration_id?: number;
  has_parent_transaction?: boolean;
  order?: { id?: number | string; merchant_order_id?: string | null };
  created_at?: string;
  currency?: string;
  error_occured?: boolean;
  owner?: number | string;
  refunded_amount_cents?: number | null;
  source_data?: { pan?: string; sub_type?: string; type?: string };
  payment_key_claims?: { extra?: { order_id?: string; order_number?: string } };
}

interface PaymobIntentionResponse {
  id?: string;
  intention_order_id?: number | string;
  client_secret?: string;
}

const HMAC_FIELDS: Array<(transaction: PaymobTransaction) => unknown> = [
  (value) => value.amount_cents,
  (value) => value.created_at,
  (value) => value.currency,
  (value) => value.error_occured,
  (value) => value.has_parent_transaction,
  (value) => value.id,
  (value) => value.integration_id,
  (value) => value.is_3d_secure,
  (value) => value.is_auth,
  (value) => value.is_capture,
  (value) => value.is_refunded,
  (value) => value.is_standalone_payment,
  (value) => value.is_voided,
  (value) => value.order?.id,
  (value) => value.owner,
  (value) => value.pending,
  (value) => value.source_data?.pan,
  (value) => value.source_data?.sub_type,
  (value) => value.source_data?.type,
  (value) => value.success,
];

export function paymobIntegrationIdsByCurrency(): Map<string, string> {
  const integrations = new Map<string, string>();
  for (const entry of env.PAYMOB_INTEGRATION_IDS.split(",")) {
    const [rawCurrency, rawId] = entry.split(":").map((value) => value?.trim());
    const currency = rawCurrency?.toUpperCase();
    if (currency && /^[A-Z]{3}$/.test(currency) && rawId && /^\d+$/.test(rawId)) integrations.set(currency, rawId);
  }
  if (!integrations.size && env.PAYMOB_INTEGRATION_ID && /^\d+$/.test(env.PAYMOB_INTEGRATION_ID) && /^[A-Z]{3}$/.test(env.PAYMOB_CURRENCY)) {
    integrations.set(env.PAYMOB_CURRENCY, env.PAYMOB_INTEGRATION_ID);
  }
  return integrations;
}

export function paymobSupportedCurrencies(): string[] {
  return [...paymobIntegrationIdsByCurrency().keys()].sort();
}

export function paymobIntegrationIdForCurrency(currency: string): string | undefined {
  return paymobIntegrationIdsByCurrency().get(currency.trim().toUpperCase());
}

function assertConfigured(currency: string): string {
  const integrationId = paymobIntegrationIdForCurrency(currency);
  const missing = [
    !env.PAYMOB_SECRET_KEY && "PAYMOB_SECRET_KEY",
    !env.PAYMOB_PUBLIC_KEY && "PAYMOB_PUBLIC_KEY",
    !paymobSupportedCurrencies().length && "PAYMOB_INTEGRATION_IDS (or PAYMOB_INTEGRATION_ID + PAYMOB_CURRENCY)",
    !env.PAYMOB_HMAC_SECRET && "PAYMOB_HMAC_SECRET",
  ].filter(Boolean);
  if (missing.length) throw new AppError(409, "PAYMOB_NOT_CONFIGURED", `Paymob is not configured. Set ${missing.join(", ")}`);
  if (!integrationId) {
    const supported = paymobSupportedCurrencies();
    throw new AppError(409, "PAYMOB_CURRENCY_UNSUPPORTED", `Paymob is not configured for ${currency.toUpperCase()}. Add a ${currency.toUpperCase()} Integration ID${supported.length ? ` or use a store currency supported by the current configuration (${supported.join(", ")})` : ""}`);
  }
  return integrationId;
}

function paymobKeyMode(): "Test" | "Live" | "Unknown" {
  if (/(^|_)test(_|$)/i.test(env.PAYMOB_SECRET_KEY)) return "Test";
  if (/(^|_)live(_|$)/i.test(env.PAYMOB_SECRET_KEY)) return "Live";
  return "Unknown";
}

function paymobError(status: number, body: unknown, currency: string): AppError {
  const payload = body as { detail?: string; message?: string; non_field_errors?: string[] } | null;
  const detail = payload?.detail ?? payload?.message ?? payload?.non_field_errors?.[0] ?? `Paymob API returned HTTP ${status}`;
  if (/integration id\/name does not exist|integration (?:id|name).*does not exist/i.test(detail)) {
    const integrationId = paymobIntegrationIdForCurrency(currency) ?? "missing";
    const mode = paymobKeyMode();
    return new AppError(409, "PAYMOB_INTEGRATION_NOT_FOUND", `Paymob rejected ${mode} Integration ID ${integrationId}. In the Paymob Dashboard, switch to ${mode} mode, open Developers → Payment Integrations, and copy an online ${currency} Integration ID from that table. Do not use an iframe ID or an ID from the other mode`);
  }
  if (/integration id\s*\+\s*currency|currency.*integration id|integration id.*currency/i.test(detail)) {
    return new AppError(409, "PAYMOB_CURRENCY_MISMATCH", `The configured Paymob Integration ID does not accept ${currency}. Use an Integration ID whose currency is ${currency} and whose mode matches your Paymob keys`);
  }
  return new AppError(502, "PAYMOB_CHECKOUT_FAILED", `Paymob could not create this checkout: ${detail}`);
}

function splitName(value: string): { firstName: string; lastName: string } {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0]?.slice(0, 50) || "Customer", lastName: parts.slice(1).join(" ").slice(0, 50) || "Customer" };
}

export function convertUsdMinorToEgp(amountMinor: number, exchangeRate: number): number {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new Error("USD amount must be a positive integer in minor units");
  if (!Number.isFinite(exchangeRate) || exchangeRate < 0.01 || exchangeRate > 1000) throw new Error("USD to EGP exchange rate is invalid");
  const converted = Math.round(amountMinor * exchangeRate);
  if (!Number.isSafeInteger(converted) || converted <= 0) throw new Error("Converted EGP amount is invalid");
  return converted;
}

export function convertUsdPaymobItemsToEgp(items: PaymobLineItem[], exchangeRate: number): PaymobLineItem[] {
  if (!items.length) throw new Error("Checkout requires at least one item");
  const sourceTotal = items.reduce((sum, item) => sum + item.unitAmountMinor * (item.quantity ?? 1), 0);
  const targetTotal = convertUsdMinorToEgp(sourceTotal, exchangeRate);
  let allocated = 0;
  return items.map((item, index) => {
    const sourceLineTotal = item.unitAmountMinor * (item.quantity ?? 1);
    const lineAmount = index === items.length - 1
      ? targetTotal - allocated
      : Math.floor(targetTotal * sourceLineTotal / sourceTotal);
    if (!Number.isSafeInteger(lineAmount) || lineAmount <= 0) throw new Error("Converted Paymob line item amount is invalid");
    allocated += lineAmount;
    return { ...item, unitAmountMinor: lineAmount, quantity: 1 };
  });
}

export async function createMarketplacePaymobCheckout(input: {
  items: PaymobLineItem[];
  currency: string;
  customer: { name: string; email: string; phone?: string };
  orderId: string;
  orderNumber: string;
}) {
  const currency = input.currency.toUpperCase();
  const configuredIntegrationId = assertConfigured(currency);
  if (!input.items.length) throw new Error("Checkout requires at least one item");
  const amountMinor = input.items.reduce((sum, item) => sum + item.unitAmountMinor * (item.quantity ?? 1), 0);
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new Error("Paymob checkout contains an invalid amount");
  const integrationId = Number(configuredIntegrationId);
  if (!Number.isSafeInteger(integrationId) || integrationId <= 0) throw new Error("PAYMOB_INTEGRATION_ID must be a positive integer");
  const { firstName, lastName } = splitName(input.customer.name);
  const callbackUrl = `${env.PUBLIC_API_URL}/api/v1/webhooks/paymob`;
  const redirectionUrl = `${env.CLIENT_URL.split(",")[0]?.trim().replace(/\/$/, "")}/purchase?payment=paymob&order_id=${encodeURIComponent(input.orderId)}`;

  const response = await fetch(`${env.PAYMOB_BASE_URL}/v1/intention/`, {
    method: "POST",
    headers: { Authorization: `Token ${env.PAYMOB_SECRET_KEY}`, Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: amountMinor,
      currency,
      payment_methods: [integrationId],
      items: input.items.map((item) => ({
        name: item.name.slice(0, 120),
        amount: item.unitAmountMinor,
        description: item.description?.slice(0, 255) ?? "Digital theme license",
        quantity: item.quantity ?? 1,
      })),
      billing_data: {
        first_name: firstName,
        last_name: lastName,
        email: input.customer.email,
        phone_number: input.customer.phone?.trim() || "NA",
        apartment: "NA",
        floor: "NA",
        street: "NA",
        building: "NA",
        city: "NA",
        country: "NA",
        state: "NA",
        postal_code: "NA",
      },
      extras: { order_id: input.orderId, order_number: input.orderNumber },
      special_reference: input.orderNumber,
      notification_url: callbackUrl,
      redirection_url: redirectionUrl,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json().catch(() => null) as PaymobIntentionResponse | null;
  if (!response.ok) throw paymobError(response.status, body, currency);
  if (!body?.id || !body.client_secret || body.intention_order_id === undefined) throw new Error("Paymob returned an incomplete payment intention");
  const checkoutUrl = new URL("/unifiedcheckout/", `${env.PAYMOB_BASE_URL}/`);
  checkoutUrl.searchParams.set("publicKey", env.PAYMOB_PUBLIC_KEY);
  checkoutUrl.searchParams.set("clientSecret", body.client_secret);
  return { intentionId: body.id, paymobOrderId: String(body.intention_order_id), checkoutUrl: checkoutUrl.toString(), amountMinor, currency };
}

export function paymobHmacPayload(transaction: PaymobTransaction): string {
  return HMAC_FIELDS.map((field) => String(field(transaction) ?? "")).join("");
}

export function verifyPaymobHmac(transaction: PaymobTransaction, suppliedHmac: string): boolean {
  if (!env.PAYMOB_HMAC_SECRET || !/^[a-f\d]{128}$/i.test(suppliedHmac)) return false;
  const expected = createHmac("sha512", env.PAYMOB_HMAC_SECRET).update(paymobHmacPayload(transaction)).digest();
  const supplied = Buffer.from(suppliedHmac, "hex");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function validatePaymobTransaction(transaction: PaymobTransaction, expectedAmountMinor: number, expectedCurrency: string): void {
  if (transaction.amount_cents !== expectedAmountMinor) throw new Error("Paymob payment amount does not match the order snapshot");
  if (transaction.currency?.toUpperCase() !== expectedCurrency.toUpperCase()) throw new Error("Paymob payment currency does not match the order snapshot");
  if (String(transaction.integration_id ?? "") !== paymobIntegrationIdForCurrency(expectedCurrency)) throw new Error("Paymob integration does not match the configured account and currency");
}

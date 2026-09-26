import env from "../config/env.ts";
import DiscountModel, { type DiscountDocument } from "../models/discount.ts";
import PaymentSettingsModel from "../models/payment-settings.ts";
import { AppError } from "../utils/app-error.ts";
import { paymobIntegrationIdForCurrency, paymobSupportedCurrencies } from "./paymob.service.ts";

export type PaymentProvider = "stripe" | "paypal" | "paymob";
export type DiscountInput = {
  code: string;
  type: "percentage" | "fixed";
  percentageBps?: number;
  amountMinor?: number;
  currency?: string;
  usageLimit: number;
  expiresAt: Date;
  active: boolean;
};

const providerLabels: Record<PaymentProvider, string> = { stripe: "Stripe", paypal: "PayPal", paymob: "Paymob" };

function validPaymobUsdToEgpRate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0.01 && value <= 1000;
}

function paymobSupportsStoreCurrency(currency: string, usdToEgpRate?: number): boolean {
  const normalized = currency.trim().toUpperCase();
  if (normalized === "USD") return validPaymobUsdToEgpRate(usdToEgpRate) && Boolean(paymobIntegrationIdForCurrency("EGP"));
  return Boolean(paymobIntegrationIdForCurrency(normalized));
}

export function normalizeDiscountCode(value: string): string {
  return value.trim().toUpperCase();
}

function providerConfigured(provider: PaymentProvider): boolean {
  if (provider === "stripe") return Boolean(env.STRIPE_SECRET_KEY);
  if (provider === "paypal") return Boolean(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET);
  return Boolean(env.PAYMOB_SECRET_KEY && env.PAYMOB_PUBLIC_KEY && paymobSupportedCurrencies().length && env.PAYMOB_HMAC_SECRET);
}

function serializeDiscount(discount: DiscountDocument & { _id: unknown }) {
  return {
    id: String(discount._id),
    code: discount.code,
    type: discount.type,
    percentageBps: discount.percentageBps,
    amountMinor: discount.amountMinor,
    currency: discount.currency,
    usageLimit: discount.usageLimit,
    timesUsed: discount.timesUsed,
    expiresAt: discount.expiresAt,
    active: discount.active,
    createdAt: discount.createdAt,
    updatedAt: discount.updatedAt,
  };
}

export async function paymentSettings(includeConfiguration = false, currency?: string) {
  const settings = await PaymentSettingsModel.findOneAndUpdate(
    { key: "default" },
    { $setOnInsert: { enabledProviders: ["stripe", "paypal"] } },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  ).lean();
  const enabled = new Set(settings?.enabledProviders ?? []);
  const paymobUsdToEgpRate = validPaymobUsdToEgpRate(settings?.paymobUsdToEgpRate) ? settings.paymobUsdToEgpRate : undefined;
  const providers = (["stripe", "paypal", "paymob"] as PaymentProvider[]).map((id) => {
    const configured = providerConfigured(id);
    const currencySupported = id !== "paymob" || !currency || paymobSupportsStoreCurrency(currency, paymobUsdToEgpRate);
    return {
      id,
      label: providerLabels[id],
      enabled: enabled.has(id) && configured && currencySupported,
      ...(id === "paymob" ? { supportedCurrencies: paymobSupportedCurrencies() } : {}),
      ...(includeConfiguration ? { configured, selected: enabled.has(id) && configured } : {}),
    };
  });
  return { enabledPaymentProviders: providers.filter((provider) => provider.enabled).map((provider) => provider.id), providers, paymobUsdToEgpRate };
}

export async function updatePaymentSettings(enabledProviders: PaymentProvider[], paymobUsdToEgpRate?: number) {
  const unique = [...new Set(enabledProviders)];
  if (!unique.length) throw new AppError(422, "PAYMENT_PROVIDER_REQUIRED", "Enable at least one payment method");
  const unconfigured = unique.filter((provider) => !providerConfigured(provider));
  if (unconfigured.length) throw new AppError(409, "PAYMENT_PROVIDER_NOT_CONFIGURED", `${unconfigured.map((provider) => providerLabels[provider]).join(" and ")} must be configured before customers can use it`);
  const current = await PaymentSettingsModel.findOne({ key: "default" }).lean();
  const effectivePaymobRate = paymobUsdToEgpRate ?? current?.paymobUsdToEgpRate;
  if (unique.includes("paymob")) {
    if (!validPaymobUsdToEgpRate(effectivePaymobRate)) throw new AppError(422, "PAYMOB_EXCHANGE_RATE_REQUIRED", "Set the USD to EGP exchange rate before enabling Paymob");
    if (!paymobIntegrationIdForCurrency("EGP")) throw new AppError(409, "PAYMOB_EGP_INTEGRATION_REQUIRED", "Paymob needs an EGP Integration ID before it can convert USD checkout totals to EGP");
  }
  await PaymentSettingsModel.findOneAndUpdate(
    { key: "default" },
    { $set: { enabledProviders: unique, ...(paymobUsdToEgpRate !== undefined ? { paymobUsdToEgpRate } : {}) } },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true, runValidators: true },
  );
  return paymentSettings(true);
}

export async function assertPaymentProviderEnabled(provider: PaymentProvider, currency?: string): Promise<void> {
  const settings = await paymentSettings(false, currency);
  if (!settings.enabledPaymentProviders.includes(provider)) {
    if (provider === "paymob" && currency && providerConfigured("paymob")) {
      if (currency.toUpperCase() === "USD") throw new AppError(409, "PAYMOB_USD_CONVERSION_UNAVAILABLE", "Paymob needs an EGP Integration ID and a USD to EGP exchange rate. Ask an administrator to finish the Paymob payment settings");
      throw new AppError(409, "PAYMOB_CURRENCY_UNSUPPORTED", `Paymob is not configured for ${currency.toUpperCase()}. Choose another payment method or add a matching Paymob Integration ID`);
    }
    throw new AppError(409, "PAYMENT_PROVIDER_UNAVAILABLE", `${providerLabels[provider]} is not currently available. Choose another payment method`);
  }
}

export async function paymobChargeConfiguration(sourceCurrency: string): Promise<{ currency: string; exchangeRate?: number }> {
  const currency = sourceCurrency.trim().toUpperCase();
  if (currency !== "USD") return { currency };
  const settings = await PaymentSettingsModel.findOne({ key: "default" }).lean();
  const exchangeRate = settings?.paymobUsdToEgpRate;
  if (!validPaymobUsdToEgpRate(exchangeRate)) throw new AppError(409, "PAYMOB_EXCHANGE_RATE_REQUIRED", "Paymob checkout is waiting for an administrator to set the USD to EGP exchange rate");
  if (!paymobIntegrationIdForCurrency("EGP")) throw new AppError(409, "PAYMOB_EGP_INTEGRATION_REQUIRED", "Paymob needs an EGP Integration ID to accept converted USD checkout totals");
  return { currency: "EGP", exchangeRate };
}

export async function listDiscounts() {
  const discounts = await DiscountModel.find().sort({ createdAt: -1 }).lean();
  return discounts.map((discount) => serializeDiscount(discount as DiscountDocument & { _id: unknown }));
}

export async function createDiscount(input: DiscountInput, createdBy: unknown) {
  const discount = await DiscountModel.create({ ...input, code: normalizeDiscountCode(input.code), createdBy });
  return serializeDiscount(discount as DiscountDocument & { _id: unknown });
}

export async function updateDiscount(id: string, input: Partial<DiscountInput>) {
  const update = { ...input, ...(input.code ? { code: normalizeDiscountCode(input.code) } : {}) };
  const discount = await DiscountModel.findByIdAndUpdate(id, { $set: update }, { returnDocument: "after", runValidators: true });
  if (!discount) throw new AppError(404, "DISCOUNT_NOT_FOUND", "Discount code not found");
  return serializeDiscount(discount as DiscountDocument & { _id: unknown });
}

export function calculateDiscountMinor(discount: Pick<DiscountDocument, "type" | "percentageBps" | "amountMinor">, subtotalMinor: number): number {
  if (!Number.isInteger(subtotalMinor) || subtotalMinor <= 0) throw new AppError(409, "CART_EMPTY", "Add an item before applying a discount");
  const amount = discount.type === "percentage"
    ? Math.floor(subtotalMinor * (discount.percentageBps ?? 0) / 10_000)
    : discount.amountMinor ?? 0;
  if (!Number.isInteger(amount) || amount <= 0) throw new AppError(422, "DISCOUNT_INVALID", "This discount does not reduce the current order");
  if (amount >= subtotalMinor) throw new AppError(422, "DISCOUNT_EXCEEDS_TOTAL", "This discount cannot be applied because it covers the entire order total");
  return amount;
}

async function validDiscount(code: string, currency: string, subtotalMinor: number) {
  const discount = await DiscountModel.findOne({ code: normalizeDiscountCode(code) });
  if (!discount) throw new AppError(404, "DISCOUNT_NOT_FOUND", "That discount code was not found");
  if (!discount.active) throw new AppError(409, "DISCOUNT_INACTIVE", "That discount code is not active");
  if (discount.expiresAt.getTime() <= Date.now()) throw new AppError(409, "DISCOUNT_EXPIRED", "That discount code has expired");
  if (discount.timesUsed >= discount.usageLimit) throw new AppError(409, "DISCOUNT_LIMIT_REACHED", "That discount code has reached its usage limit");
  if (discount.type === "fixed" && discount.currency !== currency.toUpperCase()) throw new AppError(409, "DISCOUNT_CURRENCY_MISMATCH", `That code is only valid for ${discount.currency} orders`);
  const discountMinor = calculateDiscountMinor(discount, subtotalMinor);
  return { discount, discountMinor };
}

export async function quoteDiscount(code: string, currency: string, subtotalMinor: number) {
  const { discount, discountMinor } = await validDiscount(code, currency, subtotalMinor);
  return {
    code: discount.code,
    type: discount.type,
    percentageBps: discount.percentageBps,
    amountMinor: discount.amountMinor,
    currency: discount.currency,
    discountMinor,
    expiresAt: discount.expiresAt,
  };
}

export async function claimDiscount(code: string, currency: string, subtotalMinor: number) {
  const { discount, discountMinor } = await validDiscount(code, currency, subtotalMinor);
  const claimed = await DiscountModel.findOneAndUpdate(
    { _id: discount._id, active: true, expiresAt: { $gt: new Date() }, timesUsed: { $lt: discount.usageLimit } },
    { $inc: { timesUsed: 1 } },
    { returnDocument: "after" },
  );
  if (!claimed) throw new AppError(409, "DISCOUNT_LIMIT_REACHED", "That discount code is no longer available");
  return { discount: claimed, discountMinor };
}

export async function releaseDiscountClaim(id: unknown): Promise<void> {
  await DiscountModel.updateOne({ _id: id, timesUsed: { $gt: 0 } }, { $inc: { timesUsed: -1 } });
}

export function allocateDiscount(items: Array<{ priceMinor: number }>, discountMinor: number): number[] {
  const subtotal = items.reduce((sum, item) => sum + item.priceMinor, 0);
  let allocated = 0;
  return items.map((item, index) => {
    const value = index === items.length - 1
      ? discountMinor - allocated
      : Math.floor(discountMinor * item.priceMinor / subtotal);
    const safeValue = Math.min(item.priceMinor, Math.max(0, value));
    allocated += safeValue;
    return safeValue;
  });
}

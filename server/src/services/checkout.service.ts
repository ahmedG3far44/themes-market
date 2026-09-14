import { randomBytes } from "node:crypto";
import env from "../config/env.ts";
import CartModel from "../models/cart.ts";
import OrderModel, { type OrderItemDocument } from "../models/order.ts";
import ThemeModel from "../models/theme.ts";
import TransactionModel from "../models/transaction.ts";
import UploadAssetModel from "../models/upload-asset.ts";
import { AppError } from "../utils/app-error.ts";
import { getCart, validDiscount } from "./cart.service.ts";
import { assertPaymentProviderAllowed, type CheckoutProvider } from "./payment-provider.service.ts";
import { convertUsdMinorToEgpMinor, createPaymobIntention, isPaymobConfigured, paymobConfigurationIssue } from "./paymob.service.ts";
import { createMarketplaceStripeCheckout, validateStripeCheckoutAmounts } from "./stripe.service.ts";

type CheckoutUser = { _id: unknown; email: string; name: string; role?: string };

function orderNumber(): string {
  return `ORD-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

export async function createCheckout(user: CheckoutUser, idempotencyKey: string, provider: CheckoutProvider, country?: string) {
  if (user.role === "admin") throw new AppError(403, "ADMIN_PURCHASE_FORBIDDEN", "Administrator accounts cannot purchase themes");
  assertPaymentProviderAllowed(provider, country);
  if (provider === "paymob" && !isPaymobConfigured(country)) throw new AppError(503, "PAYMOB_NOT_CONFIGURED", paymobConfigurationIssue(country) ?? "Paymob is not configured for your country");

  let order = await OrderModel.findOne({ checkoutKey: idempotencyKey, userId: user._id }).select("+checkoutUrl");
  if (order && order.paymentProvider !== provider) throw new AppError(409, "CHECKOUT_PROVIDER_CHANGED", "This checkout attempt was already created with a different payment provider");
  if (order?.checkoutUrl) return { orderId: String(order._id), checkoutUrl: order.checkoutUrl, provider: order.paymentProvider };

  if (!order) {
    const cartView = await getCart(user._id);
    if (!cartView.items.length) throw new AppError(409, "CART_EMPTY", "Add a theme to your cart before checkout");

    const cart = await CartModel.findOne({ userId: user._id });
    const themeIds = (cart?.items ?? []).map((item: { themeId: unknown }) => item.themeId);
    const themes = await ThemeModel.find({ _id: { $in: themeIds }, status: "published" });
    if (themes.length !== themeIds.length) throw new AppError(409, "CART_CHANGED", "One or more themes are no longer available. Review your cart and try again");
    if (new Set(themes.map((theme) => theme.currency)).size !== 1) throw new AppError(409, "MIXED_CURRENCY_CART", "Cart items must use one currency");

    const sourceIds = themes.map((theme) => theme.sourceAssetId).filter(Boolean);
    const readySources = await UploadAssetModel.find({ _id: { $in: sourceIds }, kind: "theme_zip", status: "ready" }).select("_id").lean();
    if (readySources.length !== themes.length) throw new AppError(409, "SOURCE_NOT_READY", "One or more theme downloads are not ready");

    const discount = await validDiscount(cart?.discountCode);
    const subtotalMinor = themes.reduce((sum, theme) => sum + theme.priceMinor, 0);
    const discountMinor = discount ? Math.floor(subtotalMinor * discount.percentage / 100) : 0;
    const allocatedDiscounts = themes.map((theme) => Math.floor(theme.priceMinor * (discount?.percentage ?? 0) / 100));
    if (allocatedDiscounts.length) allocatedDiscounts[allocatedDiscounts.length - 1] = discountMinor - allocatedDiscounts.slice(0, -1).reduce((sum, value) => sum + value, 0);

    order = await OrderModel.create({
      orderNumber: orderNumber(), userId: user._id, checkoutKey: idempotencyKey, paymentProvider: provider, status: "pending",
      currency: themes[0]?.currency ?? "USD", subtotalMinor, discountMinor, totalMinor: subtotalMinor - discountMinor,
      discountSnapshot: discount ? { code: discount.code, percentage: discount.percentage } : undefined,
      items: themes.map((theme, index) => ({
        themeId: theme._id, name: theme.name, slug: theme.slug, version: theme.version, priceMinor: theme.priceMinor,
        discountMinor: allocatedDiscounts[index] ?? 0, totalMinor: theme.priceMinor - (allocatedDiscounts[index] ?? 0), sourceAssetId: theme.sourceAssetId,
      })),
    });
  }

  let paymentAmountMinor = order.totalMinor;
  let paymentCurrency = order.currency;
  if (provider === "paymob") {
    if (order.currency !== "USD") throw new AppError(409, "PAYMOB_SOURCE_CURRENCY_UNSUPPORTED", "Paymob conversion currently supports USD-priced carts only");
    paymentAmountMinor = convertUsdMinorToEgpMinor(order.totalMinor);
    paymentCurrency = "EGP";
    order.paymentAmountMinor = paymentAmountMinor;
    order.paymentCurrency = paymentCurrency;
    order.exchangeRate = env.PAYMOB_USD_TO_EGP_RATE;
  }

  const transaction = await TransactionModel.findOneAndUpdate(
    { orderId: order._id, provider },
    {
      $set: { status: "pending", amount: paymentAmountMinor / 100, amountMinor: paymentAmountMinor, currency: paymentCurrency },
      $setOnInsert: { userId: user._id, orderId: order._id, provider, product: { name: `${order.items.length} theme${order.items.length === 1 ? "" : "s"}`, description: order.orderNumber } },
    },
    { upsert: true, returnDocument: "after", runValidators: true },
  );

  order.status = "pending";
  try {
    if (provider === "stripe") {
      const session = await createMarketplaceStripeCheckout({
        items: order.items.map((item: OrderItemDocument) => ({ name: item.name, description: `Theme license · version ${item.version}`, unitAmountMinor: item.totalMinor })),
        currency: order.currency, customerEmail: user.email, successUrl: env.STRIPE_SUCCESS_URL, cancelUrl: env.STRIPE_CANCEL_URL,
        metadata: { orderId: String(order._id), orderNumber: order.orderNumber, transactionId: String(transaction._id), userId: String(user._id) }, idempotencyKey,
      });
      if (!session.url) throw new Error("Stripe returned no checkout URL");
      const amounts = validateStripeCheckoutAmounts({ amount_subtotal: session.amountSubtotal, amount_total: session.amountTotal, currency: session.currency, total_details: session.totalDetails }, order.subtotalMinor - order.discountMinor, order.currency);
      order.taxMinor = amounts.taxMinor; order.totalMinor = amounts.totalMinor;
      order.paymentAmountMinor = amounts.totalMinor; order.paymentCurrency = amounts.currency; order.exchangeRate = undefined;
      order.stripeCheckoutSessionId = session.id; order.checkoutUrl = session.url; transaction.externalId = session.id;
      transaction.amountMinor = amounts.totalMinor; transaction.amount = amounts.totalMinor / 100;
      await Promise.all([order.save(), transaction.save()]);
      return { orderId: String(order._id), checkoutUrl: session.url, provider };
    }

    const names = user.name.trim().split(/\s+/);
    const convertedItems: number[] = order.items.map((item: OrderItemDocument) => convertUsdMinorToEgpMinor(item.totalMinor));
    if (convertedItems.length) convertedItems[convertedItems.length - 1] += paymentAmountMinor - convertedItems.reduce((sum: number, amount: number) => sum + amount, 0);
    const intention = await createPaymobIntention({
      amountMinor: paymentAmountMinor, currency: paymentCurrency, country: String(country).toUpperCase(), reference: String(order._id),
      successUrl: `${env.CLIENT_URL}/checkout/success?order_id=${String(order._id)}`,
      customer: { firstName: names[0] || "Customer", lastName: names.slice(1).join(" ") || "Customer", email: user.email },
      items: order.items.map((item: OrderItemDocument, index: number) => ({ name: item.name, description: `Theme license · version ${item.version}`, amountMinor: convertedItems[index] })),
    });
    order.paymobIntentionId = intention.id ? String(intention.id) : undefined;
    order.paymobOrderId = intention.intention_order_id ? String(intention.intention_order_id) : undefined;
    order.checkoutUrl = intention.checkoutUrl; transaction.externalId = order.paymobIntentionId ?? order.paymobOrderId;
    transaction.metadata = { ...(transaction.metadata ?? {}), paymobOrderId: order.paymobOrderId, orderAmountMinor: order.totalMinor, orderCurrency: order.currency, exchangeRate: order.exchangeRate };
    await Promise.all([order.save(), transaction.save()]);
    return { orderId: String(order._id), checkoutUrl: intention.checkoutUrl, provider };
  } catch (error) {
    await Promise.all([OrderModel.updateOne({ _id: order._id }, { $set: { status: "failed" } }), TransactionModel.updateOne({ _id: transaction._id }, { $set: { status: "declined" } })]);
    throw error;
  }
}

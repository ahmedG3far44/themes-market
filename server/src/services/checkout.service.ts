import { randomBytes } from "node:crypto";
import env from "../config/env.ts";
import CartModel from "../models/cart.ts";
import OrderModel, { type OrderItemDocument } from "../models/order.ts";
import ThemeModel from "../models/theme.ts";
import TransactionModel from "../models/transaction.ts";
import UploadAssetModel from "../models/upload-asset.ts";
import { AppError } from "../utils/app-error.ts";
import { getCart, validDiscount } from "./cart.service.ts";
import { createMarketplaceStripeCheckout, validateStripeCheckoutAmounts } from "./stripe.service.ts";

type CheckoutUser = { _id: unknown; email: string; name: string; phone?: string; role?: string };
type CheckoutRegion = { country?: string; region?: string; city?: string; timezone?: string };

function orderNumber(): string {
  return `ORD-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

export async function createCheckout(user: CheckoutUser, idempotencyKey: string, region?: CheckoutRegion) {
  if (user.role === "admin") throw new AppError(403, "ADMIN_PURCHASE_FORBIDDEN", "Administrator accounts cannot purchase themes");

  let order = await OrderModel.findOne({ checkoutKey: idempotencyKey, userId: user._id }).select("+checkoutUrl");
  if (order && (order.paymentProvider as string) !== "stripe") throw new AppError(409, "CHECKOUT_PROVIDER_UNAVAILABLE", "This checkout attempt used a payment provider that is no longer available");
  if (order?.checkoutUrl) return { orderId: String(order._id), checkoutUrl: order.checkoutUrl };

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
      orderNumber: orderNumber(), userId: user._id, checkoutKey: idempotencyKey, paymentProvider: "stripe", status: "pending",
      currency: themes[0]?.currency ?? "USD", subtotalMinor, discountMinor, taxMinor: 0, totalMinor: subtotalMinor - discountMinor,
      discountSnapshot: discount ? { code: discount.code, percentage: discount.percentage } : undefined,
      customerSnapshot: { name: user.name, email: user.email, ...(user.phone ? { phone: user.phone } : {}) },
      regionSnapshot: region,
      items: themes.map((theme, index) => ({
        themeId: theme._id, name: theme.name, slug: theme.slug, version: theme.version, priceMinor: theme.priceMinor,
        discountMinor: allocatedDiscounts[index] ?? 0, totalMinor: theme.priceMinor - (allocatedDiscounts[index] ?? 0), sourceAssetId: theme.sourceAssetId,
      })),
    });
  }

  const transaction = await TransactionModel.findOneAndUpdate(
    { orderId: order._id, provider: "stripe" },
    {
      $set: { status: "pending", amount: order.totalMinor / 100, amountMinor: order.totalMinor, currency: order.currency },
      $setOnInsert: { userId: user._id, orderId: order._id, provider: "stripe", product: { name: `${order.items.length} theme${order.items.length === 1 ? "" : "s"}`, description: order.orderNumber } },
    },
    { upsert: true, returnDocument: "after", runValidators: true },
  );

  order.status = "pending";
  try {
    const session = await createMarketplaceStripeCheckout({
      items: order.items.map((item: OrderItemDocument) => ({ name: item.name, description: `Theme license · version ${item.version}`, unitAmountMinor: item.totalMinor })),
      currency: order.currency,
      customerEmail: user.email,
      successUrl: `${env.CLIENT_URL}/purchase?payment=processing&order_id=${String(order._id)}`,
      cancelUrl: `${env.CLIENT_URL}/checkout/cancel`,
      metadata: { orderId: String(order._id), orderNumber: order.orderNumber, transactionId: String(transaction._id), userId: String(user._id) },
      idempotencyKey,
    });
    if (!session.url) throw new Error("Stripe returned no checkout URL");
    const amounts = validateStripeCheckoutAmounts({ amount_subtotal: session.amountSubtotal, amount_total: session.amountTotal, currency: session.currency, total_details: session.totalDetails }, order.subtotalMinor - order.discountMinor, order.currency);
    order.taxMinor = amounts.taxMinor;
    order.totalMinor = amounts.totalMinor;
    order.paymentAmountMinor = amounts.totalMinor;
    order.paymentCurrency = amounts.currency;
    order.stripeCheckoutSessionId = session.id;
    order.checkoutUrl = session.url;
    transaction.externalId = session.id;
    transaction.amountMinor = amounts.totalMinor;
    transaction.amount = amounts.totalMinor / 100;
    await Promise.all([order.save(), transaction.save()]);
    return { orderId: String(order._id), checkoutUrl: session.url };
  } catch (error) {
    await Promise.all([
      OrderModel.updateOne({ _id: order._id }, { $set: { status: "failed" } }),
      TransactionModel.updateOne({ _id: transaction._id }, { $set: { status: "declined" } }),
    ]);
    throw error;
  }
}

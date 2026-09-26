import CartModel from "../models/cart.ts";
import ThemeModel from "../models/theme.ts";
import EntitlementModel from "../models/entitlement.ts";
import TransactionModel from "../models/transaction.ts";

import OrderModel, { type OrderDocument } from "../models/order.ts";

export async function fulfillPaidOrder(order: OrderDocument & { _id: unknown }, externalId?: string, paymentIntentId?: string): Promise<void> {
  if (order.status === "refunded") return;
  const paidAt = order.paidAt ?? new Date();
  for (const item of order.items) {
    const result = await EntitlementModel.updateOne(
      { userId: order.userId, themeId: item.themeId },
      {
        $set: { orderId: order._id, orderItemId: item._id, purchasedVersion: item.version, sourceAssetId: item.sourceAssetId, status: "active", purchasedAt: paidAt },
        $setOnInsert: { downloadLimit: 5, downloadsUsed: 0 },
      },
      { upsert: true },
    );
    if (result.upsertedCount) await ThemeModel.updateOne({ _id: item.themeId }, { $inc: { salesCount: 1 } });
  }

  // The transaction is the payment ledger. Confirm it before exposing the order as paid,
  // so an interrupted fulfillment cannot leave a paid order with a pending transaction.
  await TransactionModel.updateOne(
    { orderId: order._id, provider: order.paymentProvider },
    {
      $set: {
        status: "success",
        paidAt,
        ...(externalId ? { externalId } : {}),
        ...(paymentIntentId ? { "metadata.paymentIntentId": paymentIntentId } : {}),
      },
      $setOnInsert: {
        userId: order.userId,
        orderId: order._id,
        provider: order.paymentProvider,
        product: { name: `${order.items.length} theme${order.items.length === 1 ? "" : "s"}`, description: order.orderNumber },
        amount: (order.paymentAmountMinor ?? order.totalMinor) / 100,
        amountMinor: order.paymentAmountMinor ?? order.totalMinor,
        currency: order.paymentCurrency ?? order.currency,
      },
    },
    { upsert: true, runValidators: true },
  );

  await Promise.all([
    CartModel.deleteOne({ userId: order.userId }),
    OrderModel.updateOne(
      { _id: order._id, status: { $in: ["pending", "failed"] } },
      { $set: { status: "paid", paidAt, ...(paymentIntentId ? { stripePaymentIntentId: paymentIntentId } : {}) }, $unset: { checkoutUrl: 1 } },
    ),
  ]);
}

export async function failOrderPayment(order: OrderDocument & { _id: unknown }, externalId?: string): Promise<void> {
  await Promise.all([
    OrderModel.updateOne({ _id: order._id, status: "pending" }, { $set: { status: "failed" }, $unset: { checkoutUrl: 1 } }),
    TransactionModel.updateOne({ orderId: order._id, provider: order.paymentProvider, status: { $ne: "success" } }, { $set: { status: "declined", ...(externalId ? { externalId } : {}) } }),
  ]);
}

export async function refundPaidOrder(order: OrderDocument & { _id: unknown }, refundAmountMinor: number): Promise<boolean> {
  const refundedAt = new Date();
  const transitioned = await OrderModel.updateOne(
    { _id: order._id, status: "paid" },
    { $set: { status: "refunded", refundedAt, refundAmountMinor }, $unset: { checkoutUrl: 1 } },
  );
  if (!transitioned.modifiedCount) return false;
  await EntitlementModel.updateMany({ orderId: order._id, status: "active" }, { $set: { status: "revoked" } });
  return true;
}

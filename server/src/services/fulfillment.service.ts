import CartModel from "../models/cart.ts";
import ThemeModel from "../models/theme.ts";
import DiscountModel from "../models/discount.ts";
import EntitlementModel from "../models/entitlement.ts";
import TransactionModel from "../models/transaction.ts";

import OrderModel, { type OrderDocument } from "../models/order.ts";

export async function fulfillPaidOrder(order: OrderDocument & { _id: unknown }, externalId?: string, paymentIntentId?: string): Promise<void> {
  const paidAt = new Date();
  const transitioned = await OrderModel.updateOne(
    { _id: order._id, status: { $ne: "paid" } },
    { $set: { status: "paid", paidAt: order.paidAt ?? paidAt, ...(paymentIntentId ? { stripePaymentIntentId: paymentIntentId } : {}) }, $unset: { checkoutUrl: 1 } },
  );
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
  if (transitioned.modifiedCount && order.discountSnapshot?.code) await DiscountModel.updateOne({ code: order.discountSnapshot.code }, { $inc: { redemptionCount: 1 } });
  await Promise.all([
    CartModel.deleteOne({ userId: order.userId }),
    TransactionModel.updateOne(
      { orderId: order._id, provider: order.paymentProvider },
      { $set: { status: "success", paidAt, ...(externalId ? { externalId } : {}), ...(paymentIntentId ? { "metadata.paymentIntentId": paymentIntentId } : {}) } },
    ),
  ]);
}

export async function failOrderPayment(order: OrderDocument & { _id: unknown }, externalId?: string): Promise<void> {
  await Promise.all([
    OrderModel.updateOne({ _id: order._id, status: { $ne: "paid" } }, { $set: { status: "failed" }, $unset: { checkoutUrl: 1 } }),
    TransactionModel.updateOne({ orderId: order._id, provider: order.paymentProvider, status: { $ne: "success" } }, { $set: { status: "declined", ...(externalId ? { externalId } : {}) } }),
  ]);
}

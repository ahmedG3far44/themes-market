import type { Request, Response } from "express";
import OrderModel from "../models/order.ts";
import { PaymobWebhookEventModel } from "../models/operations.ts";
import TransactionModel from "../models/transaction.ts";
import { failOrderPayment, fulfillPaidOrder, refundPaidOrder } from "../services/fulfillment.service.ts";
import { sendInvoiceEmail, sendRefundEmail } from "../services/payment-notification.service.ts";
import { type PaymobTransaction, validatePaymobTransaction, verifyPaymobHmac } from "../services/paymob.service.ts";

interface PaymobWebhookBody {
  type?: string;
  obj?: PaymobTransaction;
}

async function findPaymobOrder(transaction: PaymobTransaction) {
  const orderId = transaction.payment_key_claims?.extra?.order_id;
  if (orderId && /^[a-f\d]{24}$/i.test(orderId)) {
    const order = await OrderModel.findOne({ _id: orderId, paymentProvider: "paymob" });
    if (order) return order;
  }
  const providerIds = [transaction.order?.id, transaction.id].filter((value): value is string | number => value !== undefined).map(String);
  if (providerIds.length) {
    const order = await OrderModel.findOne({
      paymentProvider: "paymob",
      $or: [{ paymobOrderId: { $in: providerIds } }, { paymobTransactionId: { $in: providerIds } }],
    });
    if (order) return order;
  }
  const orderNumber = transaction.order?.merchant_order_id ?? transaction.payment_key_claims?.extra?.order_number;
  return orderNumber ? OrderModel.findOne({ orderNumber, paymentProvider: "paymob" }) : null;
}

function eventId(transaction: PaymobTransaction): string {
  return ["paymob", transaction.id, transaction.success, transaction.pending, transaction.is_refunded, transaction.is_voided, transaction.refunded_amount_cents ?? 0].join(":");
}

export async function paymobWebhookHandler(req: Request, res: Response): Promise<void> {
  const body = req.body as PaymobWebhookBody;
  const transaction = body?.obj;
  const hmac = typeof req.query.hmac === "string" ? req.query.hmac : "";
  if (body?.type !== "TRANSACTION" || !transaction?.id) {
    res.status(400).json({ code: "INVALID_PAYLOAD", detail: "Invalid Paymob webhook payload" });
    return;
  }
  if (!verifyPaymobHmac(transaction, hmac)) {
    res.status(400).json({ code: "INVALID_SIGNATURE", detail: "Invalid Paymob HMAC signature" });
    return;
  }

  const id = eventId(transaction);
  const prior = await PaymobWebhookEventModel.findById(id).lean();
  if (prior?.status === "processed") {
    res.json({ received: true });
    return;
  }

  try {
    await PaymobWebhookEventModel.findOneAndUpdate(
      { _id: id },
      { $set: { type: body.type, status: "processing" }, $unset: { errorCode: 1 } },
      { upsert: true, returnDocument: "after" },
    );
    const order = await findPaymobOrder(transaction);
    if (!order) throw new Error(`No order matches Paymob transaction ${transaction.id}`);
    const expectedAmount = order.paymentAmountMinor ?? order.totalMinor;
    validatePaymobTransaction(transaction, expectedAmount, order.paymentCurrency ?? order.currency);

    const paid = transaction.success === true && transaction.pending === false && !transaction.is_voided && !transaction.is_refunded;
    const failed = transaction.pending === false && (transaction.success === false || transaction.is_voided === true);
    const fullRefund = transaction.is_refunded === true && (transaction.refunded_amount_cents ?? 0) >= expectedAmount;
    const externalId = String(transaction.id);

    if (fullRefund && order.status === "paid") {
      await refundPaidOrder(order, order.totalMinor);
      await sendRefundEmail(order._id);
    } else if (paid && order.status !== "refunded") {
      order.paymobTransactionId = externalId;
      order.paymobOrderId = String(transaction.order?.id ?? order.paymobOrderId ?? "");
      order.paymentAmountMinor = expectedAmount;
      order.paymentCurrency = transaction.currency?.toUpperCase() ?? order.currency;
      await Promise.all([
        order.save(),
        TransactionModel.updateOne({ orderId: order._id, provider: "paymob" }, { $set: { amount: expectedAmount / 100, amountMinor: expectedAmount, currency: order.paymentCurrency } }),
      ]);
      await fulfillPaidOrder(order, externalId);
      await sendInvoiceEmail(order._id);
    } else if (failed) {
      await failOrderPayment(order, externalId);
    }

    await PaymobWebhookEventModel.updateOne({ _id: id }, { $set: { status: "processed", processedAt: new Date() } });
    res.json({ received: true });
  } catch (error) {
    console.error("Paymob fulfillment failed", error);
    await PaymobWebhookEventModel.updateOne({ _id: id }, { $set: { status: "failed", errorCode: "FULFILLMENT_FAILED" } });
    res.status(500).json({ code: "WEBHOOK_PROCESSING_FAILED", detail: "Webhook processing failed" });
  }
}

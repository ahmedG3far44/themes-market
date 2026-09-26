import type { Request, Response } from "express";
import OrderModel, { type OrderDocument } from "../models/order.ts";
import TransactionModel from "../models/transaction.ts";
import { StripeWebhookEventModel } from "../models/operations.ts";
import { failOrderPayment, fulfillPaidOrder, refundPaidOrder } from "../services/fulfillment.service.ts";
import { sendInvoiceEmail, sendRefundEmail } from "../services/payment-notification.service.ts";
import { validateStripeCheckoutAmounts, verifyStripeSignature } from "../services/stripe.service.ts";

interface StripeObject {
  id: string;
  payment_status?: string;
  payment_intent?: string | { id?: string } | null;
  amount_subtotal?: number | null;
  amount_total?: number | null;
  amount?: number | null;
  amount_refunded?: number | null;
  currency?: string | null;
  refunded?: boolean;
  status?: string;
  total_details?: { amount_discount?: number | null; amount_shipping?: number | null; amount_tax?: number | null } | null;
  metadata?: { orderId?: string; transactionId?: string };
}

export interface StripeEvent {
  id: string;
  type: string;
  data: { object: StripeObject };
}

function paymentIntentId(value: StripeObject["payment_intent"]): string | undefined {
  return typeof value === "string" ? value : value?.id;
}

export function isSuccessfulFullRefund(event: StripeEvent, expectedAmountMinor: number): boolean {
  const object = event.data.object;
  if (event.type === "charge.refunded") {
    return object.refunded === true || (typeof object.amount === "number" && typeof object.amount_refunded === "number" && object.amount_refunded >= object.amount);
  }
  if (!["refund.created", "refund.updated"].includes(event.type) || object.status !== "succeeded") return false;
  return typeof object.amount === "number" && object.amount >= expectedAmountMinor;
}

function applyStripeDiscount(order: OrderDocument, discountMinor: number): void {
  order.discountMinor = discountMinor;
  let allocated = 0;
  order.items.forEach((item, index) => {
    const itemDiscount = index === order.items.length - 1
      ? discountMinor - allocated
      : Math.floor(discountMinor * item.priceMinor / Math.max(1, order.subtotalMinor));
    item.discountMinor = Math.min(item.priceMinor, Math.max(0, itemDiscount));
    item.totalMinor = item.priceMinor - item.discountMinor;
    allocated += item.discountMinor;
  });
}

export async function stripeWebhookHandler(req: Request, res: Response): Promise<void> {
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
  const signature = String(req.headers["stripe-signature"] ?? "");
  if (!raw.length || !signature || !verifyStripeSignature(raw, signature)) {
    res.status(400).json({ code: "INVALID_SIGNATURE", detail: "Invalid Stripe signature" });
    return;
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(raw.toString("utf8")) as StripeEvent;
  } catch {
    res.status(400).json({ code: "INVALID_PAYLOAD", detail: "Invalid webhook payload" });
    return;
  }

  const prior = await StripeWebhookEventModel.findById(event.id).lean();
  if (prior?.status === "processed") {
    res.json({ received: true });
    return;
  }

  try {
    await StripeWebhookEventModel.findOneAndUpdate({ _id: event.id }, { $set: { type: event.type, status: "processing" }, $unset: { errorCode: 1 } }, { upsert: true, returnDocument: "after" });
    const object = event.data.object;
    const isCheckoutEvent = event.type.startsWith("checkout.session.");
    const paid = (event.type === "checkout.session.completed" && ["paid", "no_payment_required"].includes(object.payment_status ?? "")) || event.type === "checkout.session.async_payment_succeeded";
    const failed = event.type === "checkout.session.async_payment_failed" || event.type === "checkout.session.expired";

    if (isCheckoutEvent) {
      const order = object.metadata?.orderId ? await OrderModel.findById(object.metadata.orderId) : await OrderModel.findOne({ stripeCheckoutSessionId: object.id });
      if ((paid || failed) && !order) throw new Error(`No order matches Stripe Checkout Session ${object.id}`);

      if (order) {
        if (paid && order.status !== "refunded") {
          const stripeSubtotalMinor = order.stripeSubtotalMinor ?? order.subtotalMinor - order.discountMinor;
          const amounts = validateStripeCheckoutAmounts(object, stripeSubtotalMinor, order.currency);
          const priorLineDiscountMinor = Math.max(0, order.subtotalMinor - stripeSubtotalMinor);
          applyStripeDiscount(order, priorLineDiscountMinor + amounts.discountMinor);
          order.stripeSubtotalMinor = amounts.subtotalMinor;
          order.taxMinor = amounts.taxMinor;
          order.totalMinor = amounts.totalMinor;
          order.paymentAmountMinor = amounts.totalMinor;
          order.paymentCurrency = amounts.currency;
          await Promise.all([
            order.save(),
            TransactionModel.updateOne({ orderId: order._id, provider: "stripe" }, { $set: { amount: amounts.totalMinor / 100, amountMinor: amounts.totalMinor, currency: amounts.currency } }),
          ]);
          await fulfillPaidOrder(order, object.id, paymentIntentId(object.payment_intent));
          await sendInvoiceEmail(order._id);
        } else if (failed) {
          await failOrderPayment(order, object.id);
        }
      } else if (object.metadata?.transactionId) {
        const transaction = await TransactionModel.findOne({ _id: object.metadata.transactionId, provider: "stripe" });
        if (paid && transaction) {
          if (object.amount_total !== (transaction.amountMinor ?? Math.round(transaction.amount * 100)) || object.currency?.toUpperCase() !== transaction.currency) throw new Error("Stripe checkout amount or currency does not match the transaction");
          await TransactionModel.updateOne({ _id: transaction._id, status: { $ne: "success" } }, { $set: { status: "success", paidAt: new Date(), externalId: object.id, "metadata.paymentIntentId": paymentIntentId(object.payment_intent) } });
        } else if (failed) {
          await TransactionModel.updateOne({ _id: object.metadata.transactionId, provider: "stripe", status: { $ne: "success" } }, { $set: { status: "declined", externalId: object.id } });
        }
      }
    } else if (["charge.refunded", "refund.created", "refund.updated"].includes(event.type)) {
      const intentId = paymentIntentId(object.payment_intent);
      const order = object.metadata?.orderId
        ? await OrderModel.findById(object.metadata.orderId)
        : intentId ? await OrderModel.findOne({ stripePaymentIntentId: intentId }) : null;
      if (order && isSuccessfulFullRefund(event, order.paymentAmountMinor ?? order.totalMinor)) {
        const refundAmountMinor = event.type === "charge.refunded"
          ? object.amount_refunded ?? object.amount ?? order.totalMinor
          : object.amount ?? order.totalMinor;
        await refundPaidOrder(order, refundAmountMinor);
        await sendRefundEmail(order._id);
      }
    }

    await StripeWebhookEventModel.updateOne({ _id: event.id }, { $set: { status: "processed", processedAt: new Date() } });
    res.json({ received: true });
  } catch (error) {
    console.error("Stripe fulfillment failed", error);
    await StripeWebhookEventModel.updateOne({ _id: event.id }, { $set: { status: "failed", errorCode: "FULFILLMENT_FAILED" } });
    res.status(500).json({ code: "WEBHOOK_PROCESSING_FAILED", detail: "Webhook processing failed" });
  }
}

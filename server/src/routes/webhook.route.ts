import type { Request, Response } from "express";
import OrderModel from "../models/order.ts";
import TransactionModel from "../models/transaction.ts";
import { StripeWebhookEventModel } from "../models/operations.ts";
import { failOrderPayment, fulfillPaidOrder } from "../services/fulfillment.service.ts";
import { validateStripeCheckoutAmounts, verifyStripeSignature } from "../services/stripe.service.ts";

interface StripeEvent {
  id: string;
  type: string;
  data: { object: { id: string; payment_status?: string; payment_intent?: string | { id?: string } | null; amount_subtotal?: number | null; amount_total?: number | null; currency?: string | null; total_details?: { amount_discount?: number | null; amount_shipping?: number | null; amount_tax?: number | null } | null; metadata?: { orderId?: string; transactionId?: string } } };
}

function paymentIntentId(value: StripeEvent["data"]["object"]["payment_intent"]): string | undefined {
  return typeof value === "string" ? value : value?.id;
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
    const session = event.data.object;
    const isCheckoutEvent = event.type.startsWith("checkout.session.");
    const paid = (event.type === "checkout.session.completed" && ["paid", "no_payment_required"].includes(session.payment_status ?? "")) || event.type === "checkout.session.async_payment_succeeded";
    const failed = event.type === "checkout.session.async_payment_failed" || event.type === "checkout.session.expired";
    const order = session.metadata?.orderId ? await OrderModel.findById(session.metadata.orderId) : await OrderModel.findOne({ stripeCheckoutSessionId: session.id });

    if (isCheckoutEvent && (paid || failed) && !order) throw new Error(`No order matches Stripe Checkout Session ${session.id}`);

    if (order) {
      if (paid) {
        const amounts = validateStripeCheckoutAmounts(session, order.subtotalMinor - order.discountMinor, order.currency);
        order.taxMinor = amounts.taxMinor;
        order.totalMinor = amounts.totalMinor;
        await Promise.all([
          order.save(),
          TransactionModel.updateOne({ orderId: order._id, provider: "stripe" }, { $set: { amount: amounts.totalMinor / 100, amountMinor: amounts.totalMinor, currency: amounts.currency } }),
        ]);
        await fulfillPaidOrder(order, session.id, paymentIntentId(session.payment_intent));
      } else if (failed) {
        await failOrderPayment(order, session.id);
      }
    } else if (session.metadata?.transactionId) {
      const transaction = await TransactionModel.findOne({ _id: session.metadata.transactionId, provider: "stripe" });
      if (paid && transaction) {
        if (session.amount_total !== (transaction.amountMinor ?? Math.round(transaction.amount * 100)) || session.currency?.toUpperCase() !== transaction.currency) throw new Error("Stripe checkout amount or currency does not match the transaction");
        await TransactionModel.updateOne({ _id: transaction._id, status: { $ne: "success" } }, { $set: { status: "success", paidAt: new Date(), externalId: session.id, "metadata.paymentIntentId": paymentIntentId(session.payment_intent) } });
      } else if (failed) {
        await TransactionModel.updateOne({ _id: session.metadata.transactionId, provider: "stripe", status: { $ne: "success" } }, { $set: { status: "declined", externalId: session.id } });
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

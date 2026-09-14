import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import mongoose from "mongoose";
import env from "../config/env.ts";
import OrderModel from "../models/order.ts";
import { StripeWebhookEventModel } from "../models/operations.ts";
import TransactionModel from "../models/transaction.ts";
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
    const paid = (event.type === "checkout.session.completed" && session.payment_status === "paid") || event.type === "checkout.session.async_payment_succeeded";
    const failed = event.type === "checkout.session.async_payment_failed" || event.type === "checkout.session.expired";
    const order = session.metadata?.orderId ? await OrderModel.findById(session.metadata.orderId) : await OrderModel.findOne({ stripeCheckoutSessionId: session.id });

    if (order?.paymentProvider === "stripe") {
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

const paymobHmacFields = ["amount_cents", "created_at", "currency", "error_occured", "has_parent_transaction", "id", "integration_id", "is_3d_secure", "is_auth", "is_capture", "is_refunded", "is_standalone_payment", "is_voided", "order.id", "owner", "pending", "source_data.pan", "source_data.sub_type", "source_data.type", "success"] as const;

function nestedValue(value: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => current && typeof current === "object" ? (current as Record<string, unknown>)[key] : undefined, value);
}

export function verifyPaymobSignature(object: Record<string, unknown>, signature: string): boolean {
  if (!signature) return false;
  const payload = paymobHmacFields.map((field) => String(nestedValue(object, field) ?? "")).join("");
  const received = Buffer.from(signature.toLowerCase());
  if (!env.PAYMOB_HMAC_SECRET) return false;
  const expected = Buffer.from(createHmac("sha512", env.PAYMOB_HMAC_SECRET).update(payload).digest("hex"));
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export async function paymobWebhookHandler(req: Request, res: Response): Promise<void> {
  const body = req.body as { obj?: Record<string, unknown>; hmac?: string };
  const object = body?.obj ?? body as unknown as Record<string, unknown>;
  const signature = String(req.query.hmac ?? body?.hmac ?? req.headers["x-paymob-hmac"] ?? "");
  if (!verifyPaymobSignature(object, signature)) {
    res.status(400).json({ code: "INVALID_SIGNATURE", detail: "Invalid Paymob signature" });
    return;
  }

  try {
    const orderData = object.order && typeof object.order === "object" ? object.order as Record<string, unknown> : undefined;
    const extras = object.extras && typeof object.extras === "object" ? object.extras as Record<string, unknown> : undefined;
    const reference = String(orderData?.merchant_order_id ?? orderData?.special_reference ?? object.special_reference ?? extras?.orderId ?? "");
    const providerOrderId = String(orderData?.id ?? (typeof object.order !== "object" ? object.order : "") ?? "");
    const providerTransactionId = String(object.id ?? "");
    const order = reference && mongoose.isValidObjectId(reference) ? await OrderModel.findById(reference) : await OrderModel.findOne({ paymobOrderId: providerOrderId });
    const paid = object.success === true && object.pending !== true && object.is_voided !== true && object.is_refunded !== true;

    if (order?.paymentProvider === "paymob") {
      if (paid) {
        const expectedAmount = order.paymentAmountMinor ?? order.totalMinor;
        const expectedCurrency = order.paymentCurrency ?? order.currency;
        if (Number(object.integration_id) !== Number(env.PAYMOB_INTEGRATION_ID)) throw new Error("Paymob integration does not match the configured payment method");
        if (Number(object.amount_cents) !== expectedAmount || String(object.currency).toUpperCase() !== expectedCurrency) throw new Error("Paymob amount or currency does not match the payment snapshot");
        await fulfillPaidOrder(order, providerTransactionId || order.paymobIntentionId);
      } else if (object.pending !== true) {
        await failOrderPayment(order, providerTransactionId || order.paymobIntentionId);
      }
    }

    res.json({ received: true });
  } catch (error) {
    console.error("Paymob fulfillment failed", error);
    res.status(500).json({ code: "WEBHOOK_PROCESSING_FAILED", detail: "Webhook processing failed" });
  }
}

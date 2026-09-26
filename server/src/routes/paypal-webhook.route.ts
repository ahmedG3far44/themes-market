import type { Request, Response } from "express";
import OrderModel from "../models/order.ts";
import { PaypalWebhookEventModel } from "../models/operations.ts";
import TransactionModel from "../models/transaction.ts";
import { failOrderPayment, fulfillPaidOrder, refundPaidOrder } from "../services/fulfillment.service.ts";
import { sendInvoiceEmail, sendRefundEmail } from "../services/payment-notification.service.ts";
import { paypalDecimalToMinor, validatePaypalAmount, verifyPaypalWebhookSignature } from "../services/paypal.service.ts";

interface PaypalWebhookResource {
  id?: string;
  state?: string;
  status?: string;
  custom?: string;
  custom_id?: string;
  invoice_number?: string;
  invoice_id?: string;
  parent_payment?: string;
  amount?: { total?: string; value?: string; currency?: string; currency_code?: string };
  supplementary_data?: { related_ids?: { order_id?: string; capture_id?: string } };
}

interface PaypalWebhookEvent {
  id: string;
  event_type: string;
  resource: PaypalWebhookResource;
}

function paypalAmount(resource: PaypalWebhookResource): { amount?: string; currency?: string } {
  return { amount: resource.amount?.value ?? resource.amount?.total, currency: resource.amount?.currency_code ?? resource.amount?.currency };
}

async function paypalOrder(resource: PaypalWebhookResource) {
  const customId = resource.custom_id ?? resource.custom;
  if (customId && /^[a-f\d]{24}$/i.test(customId)) {
    const byId = await OrderModel.findOne({ _id: customId, paymentProvider: "paypal" });
    if (byId) return byId;
  }
  const identifiers = [resource.id, resource.parent_payment, resource.supplementary_data?.related_ids?.order_id, resource.supplementary_data?.related_ids?.capture_id].filter((value): value is string => Boolean(value));
  if (identifiers.length) {
    const byProviderId = await OrderModel.findOne({ paymentProvider: "paypal", $or: [{ paypalToken: { $in: identifiers } }, { paypalTransactionId: { $in: identifiers } }] });
    if (byProviderId) return byProviderId;
  }
  const invoiceId = resource.invoice_id ?? resource.invoice_number;
  return invoiceId ? OrderModel.findOne({ orderNumber: invoiceId, paymentProvider: "paypal" }) : null;
}

export async function paypalWebhookHandler(req: Request, res: Response): Promise<void> {
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
  let event: PaypalWebhookEvent;
  try {
    event = JSON.parse(raw.toString("utf8")) as PaypalWebhookEvent;
    if (!event.id || !event.event_type || !event.resource) throw new Error("Missing webhook fields");
  } catch {
    res.status(400).json({ code: "INVALID_PAYLOAD", detail: "Invalid webhook payload" });
    return;
  }

  try {
    if (!(await verifyPaypalWebhookSignature(event, req.headers))) {
      res.status(400).json({ code: "INVALID_SIGNATURE", detail: "Invalid PayPal signature" });
      return;
    }
  } catch (error) {
    console.error("PayPal webhook verification failed", error);
    res.status(400).json({ code: "INVALID_SIGNATURE", detail: "Invalid PayPal signature" });
    return;
  }

  const prior = await PaypalWebhookEventModel.findById(event.id).lean();
  if (prior?.status === "processed") {
    res.json({ received: true });
    return;
  }

  try {
    await PaypalWebhookEventModel.findOneAndUpdate({ _id: event.id }, { $set: { type: event.event_type, status: "processing" }, $unset: { errorCode: 1 } }, { upsert: true, returnDocument: "after" });
    const paid = ["PAYMENT.SALE.COMPLETED", "PAYMENT.CAPTURE.COMPLETED"].includes(event.event_type);
    const failed = ["PAYMENT.SALE.DENIED", "PAYMENT.CAPTURE.DENIED", "PAYMENT.CAPTURE.DECLINED"].includes(event.event_type);
    const refunded = ["PAYMENT.SALE.REFUNDED", "PAYMENT.CAPTURE.REFUNDED"].includes(event.event_type);

    if (paid || failed || refunded) {
      const order = await paypalOrder(event.resource);
      if (!order) throw new Error(`No order matches PayPal event ${event.id}`);
      const { amount, currency } = paypalAmount(event.resource);

      if (paid && order.status !== "refunded") {
        const expectedAmount = order.paymentAmountMinor ?? order.totalMinor;
        validatePaypalAmount(amount, currency, expectedAmount, order.paymentCurrency ?? order.currency);
        if (event.resource.id) order.paypalTransactionId = event.resource.id;
        order.paymentAmountMinor = expectedAmount;
        order.paymentCurrency = (currency ?? order.currency).toUpperCase();
        await Promise.all([
          order.save(),
          TransactionModel.updateOne({ orderId: order._id, provider: "paypal" }, { $set: { amount: expectedAmount / 100, amountMinor: expectedAmount, currency: order.paymentCurrency } }),
        ]);
        await fulfillPaidOrder(order, event.resource.id);
        await sendInvoiceEmail(order._id);
      } else if (failed) {
        await failOrderPayment(order, event.resource.id);
      } else if (refunded && order.status === "paid") {
        const refundMinor = paypalDecimalToMinor(amount);
        if (refundMinor !== null && currency?.toUpperCase() === order.currency && refundMinor >= (order.paymentAmountMinor ?? order.totalMinor)) {
          await refundPaidOrder(order, refundMinor);
          await sendRefundEmail(order._id);
        }
      }
    }

    await PaypalWebhookEventModel.updateOne({ _id: event.id }, { $set: { status: "processed", processedAt: new Date() } });
    res.json({ received: true });
  } catch (error) {
    console.error("PayPal fulfillment failed", error);
    await PaypalWebhookEventModel.updateOne({ _id: event.id }, { $set: { status: "failed", errorCode: "FULFILLMENT_FAILED" } });
    res.status(500).json({ code: "WEBHOOK_PROCESSING_FAILED", detail: "Webhook processing failed" });
  }
}

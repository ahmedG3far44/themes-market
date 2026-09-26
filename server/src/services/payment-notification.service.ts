import OrderModel from "../models/order.ts";
import { sendEmailTemplate } from "./email.service.ts";
import { paidOrderInvoiceForAdmin } from "./pdf.service.ts";

export async function sendInvoiceEmail(orderId: unknown): Promise<void> {
  const order = await OrderModel.findById(orderId);
  if (!order || order.invoiceEmailSentAt || order.status !== "paid") return;
  const invoice = await paidOrderInvoiceForAdmin(String(order._id));
  await sendEmailTemplate({
    to: order.customerSnapshot?.email ?? "",
    type: "invoice",
    variables: {
      name: order.customerSnapshot?.name,
      orderNumber: order.orderNumber,
      amountMinor: order.totalMinor,
      currency: order.currency,
      paymentAmountMinor: order.paymentAmountMinor,
      paymentCurrency: order.paymentCurrency,
      paymentExchangeRate: order.paymentExchangeRate,
      orderDate: (order.paidAt ?? order.updatedAt ?? new Date()).toISOString(),
      items: order.items.map((item: { name: string; totalMinor: number }) => ({ name: item.name, priceMinor: item.totalMinor })),
      ...(order.discountMinor > 0 && order.discountSnapshot?.code ? {
        discount: {
          code: order.discountSnapshot.code,
          type: order.discountSnapshot.type ?? "percentage",
          percentageBps: order.discountSnapshot.percentageBps ?? (order.discountSnapshot.percentage !== undefined ? Math.round(order.discountSnapshot.percentage * 100) : undefined),
          amountMinor: order.discountSnapshot.amountMinor,
          appliedAmountMinor: order.discountMinor,
        },
      } : {}),
    },
    attachment: { filename: invoice.filename, content: invoice.pdf },
    idempotencyKey: `invoice-order/${String(order._id)}`,
  });
  await OrderModel.updateOne({ _id: order._id }, { $set: { invoiceEmailSentAt: new Date() } });
}

export async function sendRefundEmail(orderId: unknown): Promise<void> {
  const order = await OrderModel.findById(orderId);
  if (!order || order.refundEmailSentAt || order.status !== "refunded") return;
  await sendEmailTemplate({
    to: order.customerSnapshot?.email ?? "",
    type: "refund",
    variables: {
      name: order.customerSnapshot?.name,
      orderNumber: order.orderNumber,
      amountMinor: order.refundAmountMinor ?? order.totalMinor,
      currency: order.currency,
    },
    idempotencyKey: `refund-order/${String(order._id)}`,
  });
  await OrderModel.updateOne({ _id: order._id }, { $set: { refundEmailSentAt: new Date() } });
}

import PDFDocument from "pdfkit";
import UserModel from "../models/user.ts";
import OrderModel from "../models/order.ts";

import { createRequire } from "node:module";
import { AppError } from "../utils/app-error.ts";

import type { OrderDocument } from "../models/order.ts";

type InvoiceCustomer = { name: string; email: string; phone?: string };
type InvoiceRegion = { country?: string; region?: string; city?: string; timezone?: string };
type InvoiceOrder = OrderDocument & { _id: unknown };

export interface InvoiceData {
  order: InvoiceOrder;
  customer: InvoiceCustomer;
  region?: InvoiceRegion;
}

const brand = "#5340C6";
const ink = "#1A1A1A";
const muted = "#6B6B6B";
const line = "#E2E2E2";
const soft = "#F5F5F5";
const negative = "#A33A3A";

const require = createRequire(import.meta.url);
const fonts = {
  arabic: require.resolve("@fontsource/noto-sans-arabic/files/noto-sans-arabic-arabic-400-normal.woff"),
  arabicBold: require.resolve("@fontsource/noto-sans-arabic/files/noto-sans-arabic-arabic-700-normal.woff"),
};
const hasArabic = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;

function clean(value: unknown, fallback = "Not provided"): string {
  const result = String(value ?? "").replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
  return result || fallback;
}

function amount(value: number, currency: string): string {
  return `${clean(currency, "USD").toUpperCase()} ${(value / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function invoiceDate(value: Date | string | undefined): string {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(date) + " UTC";
}

export function assertInvoicePaid(status: OrderDocument["status"]): void {
  if (status !== "paid") throw new AppError(409, "INVOICE_NOT_AVAILABLE", "An invoice is available only after the order is paid");
}

async function collect(document: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
    document.end();
  });
}

export function createInvoicePdf(data: InvoiceData): Promise<Buffer> {
  assertInvoicePaid(data.order.status);
  const doc = new PDFDocument({ size: "A4", margin: 48, bufferPages: true, compress: true, info: { Title: `Invoice ${data.order.orderNumber}`, Author: "Foliokit", Subject: "Paid order invoice" } });
  doc.registerFont("InvoiceArabic", fonts.arabic);
  doc.registerFont("InvoiceArabicBold", fonts.arabicBold);
  const font = (value: string, bold = false) => hasArabic.test(value) ? (bold ? "InvoiceArabicBold" : "InvoiceArabic") : (bold ? "Helvetica-Bold" : "Helvetica");
  const width = doc.page.width - 96;
  const right = doc.page.width - 48;

  const header = () => {
    doc.fillColor(ink).font("Helvetica-Bold").fontSize(17).text("FOLIOKIT", 48, 42);
    doc.fillColor(muted).font("Helvetica").fontSize(8).text("ONLINE PORTFOLIO THEMES STORE", 48, 63, { characterSpacing: 1.2 });

    doc.fillColor(brand).font("Helvetica-Bold").fontSize(28).text("INVOICE", 360, 42, { width: right - 360, align: "right" });

    doc.moveTo(48, 90).lineTo(right, 90).lineWidth(1).strokeColor(line).stroke();
  };
  header();

  // meta strip
  doc.roundedRect(48, 110, width, 72, 8).fill(soft);
  doc.fillColor(muted).font("Helvetica-Bold").fontSize(8).text("INVOICE NUMBER", 62, 124);
  doc.fillColor(ink).font("Helvetica-Bold").fontSize(11).text(clean(data.order.orderNumber), 62, 139, { width: 190 });
  doc.fillColor(muted).font("Helvetica-Bold").fontSize(8).text("ORDERED", 275, 124);
  doc.fillColor(ink).font("Helvetica").fontSize(9).text(invoiceDate(data.order.createdAt), 275, 139, { width: 125 });
  doc.fillColor(muted).font("Helvetica-Bold").fontSize(8).text("PAID", 414, 124);
  doc.fillColor(ink).font("Helvetica").fontSize(9).text(invoiceDate(data.order.paidAt), 414, 139, { width: 120 });

  const customerName = clean(data.customer.name);
  doc.fillColor(brand).font("Helvetica-Bold").fontSize(8).text("BILLED TO", 48, 207);
  doc.fillColor(ink).font(font(customerName, true)).fontSize(12).text(customerName, 48, 223, { width: 235, align: hasArabic.test(customerName) ? "right" : "left" });
  doc.fillColor(muted).font("Helvetica").fontSize(9).text(clean(data.customer.email), 48, 242, { width: 235 });
  if (data.customer.phone) doc.text(clean(data.customer.phone), 48, 257, { width: 235 });

  doc.fillColor(brand).font("Helvetica-Bold").fontSize(8).text("PAYMENT DETAILS", 320, 207);
  doc.fillColor(ink).font("Helvetica").fontSize(9).text(`Provider: ${clean(data.order.paymentProvider).toUpperCase()}`, 320, 223);
  doc.text(`Currency: ${clean(data.order.currency).toUpperCase()}`, 320, 239);
  if (data.order.paymentCurrency && data.order.paymentCurrency !== data.order.currency) {
    doc.text(`Charged: ${amount(data.order.paymentAmountMinor ?? data.order.totalMinor, data.order.paymentCurrency)}`, 320, 255, { width: 225 });
  }

  let y = 322;
  const columns = { description: 48, quantity: 315, unit: 350, discount: 421, total: 487 };
  const drawTableHeader = () => {
    doc.rect(48, y, width, 28).fill(soft);
    doc.fillColor(ink).font("Helvetica-Bold").fontSize(8);
    doc.text("ITEM", columns.description + 10, y + 10, { width: 235 });
    doc.text("QTY", columns.quantity, y + 10, { width: 28, align: "center" });
    doc.text("PRICE", columns.unit, y + 10, { width: 65, align: "right" });
    doc.text("DISCOUNT", columns.discount, y + 10, { width: 60, align: "right" });
    doc.text("TOTAL", columns.total, y + 10, { width: 60, align: "right" });
    y += 28;
  };
  drawTableHeader();

  for (const [index, item] of data.order.items.entries()) {
    if (y > 692) {
      doc.addPage();
      header();
      y = 110;
      drawTableHeader();
    }
    const rowHeight = 48;
    doc.rect(48, y, width, rowHeight).fill(index % 2 ? soft : "#FFFFFF");
    doc.moveTo(48, y + rowHeight).lineTo(right, y + rowHeight).lineWidth(.5).strokeColor(line).stroke();
    doc.fillColor(ink).font(font(clean(item.name), true)).fontSize(9).text(clean(item.name), columns.description + 10, y + 10, { width: 235, height: 14, ellipsis: true });
    doc.fillColor(muted).font("Helvetica").fontSize(8).text(`Version ${clean(item.version)}`, columns.description + 10, y + 27, { width: 235 });
    doc.fillColor(ink).fontSize(8).text("1", columns.quantity, y + 18, { width: 28, align: "center" });
    doc.text(amount(item.priceMinor, data.order.currency), columns.unit, y + 18, { width: 65, align: "right" });
    doc.fillColor(item.discountMinor > 0 ? negative : muted).text(item.discountMinor > 0 ? `-${amount(item.discountMinor, data.order.currency)}` : "-", columns.discount, y + 18, { width: 60, align: "right" });
    doc.fillColor(ink).font("Helvetica-Bold").text(amount(item.totalMinor, data.order.currency), columns.total, y + 18, { width: 60, align: "right" });
    y += rowHeight;
  }

  if (y > 590) { doc.addPage(); header(); y = 118; }
  const netSubtotal = data.order.subtotalMinor - data.order.discountMinor;
  const totalsX = 336;
  y += 24;
  const totalRow = (label: string, value: string, bold = false, color = ink) => {
    doc.fillColor(bold ? ink : muted).font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 11 : 9).text(label, totalsX, y, { width: 105 });
    doc.fillColor(color).font(bold ? "Helvetica-Bold" : "Helvetica").text(value, 441, y, { width: 106, align: "right" });
    y += bold ? 26 : 20;
  };
  totalRow("Original subtotal", amount(data.order.subtotalMinor, data.order.currency));
  if (data.order.discountMinor > 0) totalRow(`Discount${data.order.discountSnapshot?.code ? ` (${clean(data.order.discountSnapshot.code)})` : ""}`, `-${amount(data.order.discountMinor, data.order.currency)}`, false, negative);
  totalRow("After discount", amount(netSubtotal, data.order.currency));
  if (data.order.taxMinor > 0) totalRow("Tax", amount(data.order.taxMinor, data.order.currency));
  y += 10;
  doc.moveTo(totalsX, y - 5).lineTo(right, y - 5).lineWidth(1).strokeColor(line).stroke();

  y += 24;
  totalRow("Total paid", amount(data.order.totalMinor, data.order.currency), true, ink);
  doc.moveTo(totalsX, y - 5).lineTo(right, y - 5).lineWidth(1).strokeColor(line);

  doc.fillColor(muted).font("Helvetica").fontSize(8).text("Payment status: PAID", 48, y - 22);
  doc.text(`Order ID: ${clean(data.order._id)}`, 48, y - 8, { width: 270 });

  const pages = doc.bufferedPageRange();
  for (let index = 0; index < pages.count; index += 1) {
    doc.switchToPage(index);
    const footerY = doc.page.height - 82;
    doc.moveTo(48, footerY - 12).lineTo(right, footerY - 12).lineWidth(.5).strokeColor(line).stroke();
    doc.fillColor(muted).font("Helvetica").fontSize(7).text(`Page ${index + 1} of ${pages.count}`, right - 80, footerY, { width: 80, align: "right", lineBreak: false });
    doc.text("Thank you for purchasing from Foliokit.", 48, footerY, { lineBreak: false });
  }

  return collect(doc);
}

async function invoiceData(order: InvoiceOrder): Promise<InvoiceData> {
  assertInvoicePaid(order.status);
  const user = await UserModel.findById(order.userId).select("name email phone").lean();
  return {
    order,
    customer: {
      name: order.customerSnapshot?.name ?? user?.name ?? "Customer",
      email: order.customerSnapshot?.email ?? user?.email ?? "Not available",
      phone: order.customerSnapshot?.phone ?? user?.phone,
    },
    region: order.regionSnapshot,
  };
}

export async function paidOrderInvoiceForUser(userId: unknown, orderId: string): Promise<{ pdf: Buffer; filename: string }> {
  const order = await OrderModel.findOne({ _id: orderId, userId }).lean<InvoiceOrder>();
  if (!order) throw new AppError(404, "ORDER_NOT_FOUND", "Order not found");
  const pdf = await createInvoicePdf(await invoiceData(order));
  return { pdf, filename: `invoice-${order.orderNumber}.pdf` };
}

export async function paidOrderInvoiceForAdmin(orderId: string): Promise<{ pdf: Buffer; filename: string }> {
  const order = await OrderModel.findById(orderId).lean<InvoiceOrder>();
  if (!order) throw new AppError(404, "ORDER_NOT_FOUND", "Order not found");
  const pdf = await createInvoicePdf(await invoiceData(order));
  return { pdf, filename: `invoice-${order.orderNumber}.pdf` };
}

export async function createExampleInvoicePdf(): Promise<{ pdf: Buffer; filename: string }> {
  const now = new Date();
  const order = {
    _id: "64b64c16e3a54f0012345679",
    orderNumber: "ORD-DEMO-001",
    userId: "64b64c16e3a54f0012345671",
    status: "paid",
    paymentProvider: "stripe",
    checkoutKey: "email-template-demo",
    currency: "USD",
    subtotalMinor: 4900,
    discountMinor: 0,
    taxMinor: 392,
    totalMinor: 5292,
    paidAt: now,
    createdAt: now,
    updatedAt: now,
    items: [{
      _id: "64b64c16e3a54f0012345672",
      themeId: "64b64c16e3a54f0012345673",
      sourceAssetId: "64b64c16e3a54f0012345674",
      name: "Studio Grid",
      slug: "studio-grid",
      version: "1.0.0",
      priceMinor: 4900,
      discountMinor: 0,
      totalMinor: 4900,
    }],
  } as unknown as InvoiceOrder;
  return { pdf: await createInvoicePdf({ order, customer: { name: "Demo Customer", email: "customer@example.com" } }), filename: "invoice-demo.pdf" };
}

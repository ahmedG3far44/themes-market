import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import UserModel from "../models/user.ts";
import { requireAdmin, requireDatabaseUser } from "../middlewares/auth.ts";
import { rateLimit } from "../middlewares/rate-limit.ts";
import { audit } from "../services/audit.service.ts";
import { emailTemplateTypes, sendEmailTemplate, sendPromotionEmails, type EmailTemplateVariables } from "../services/email.service.ts";
import { createExampleInvoicePdf } from "../services/pdf.service.ts";
import { AppError } from "../utils/app-error.ts";

const router = Router();
router.use(requireDatabaseUser, requireAdmin);

const testEmailSchema = z.object({
  type: z.enum(emailTemplateTypes),
  email: z.email().max(254),
}).strict();

const promotionSchema = z.object({
  userIds: z.array(z.string().regex(/^[a-f\d]{24}$/i)).min(1).max(100),
  offerTitle: z.string().trim().min(3).max(100),
  offerDescription: z.string().trim().min(10).max(1200),
  discountDetails: z.string().trim().min(3).max(300),
  actionUrl: z.url().max(500),
  ctaLabel: z.string().trim().min(2).max(40),
  expiresAt: z.string().trim().max(80).optional(),
}).strict();

const dummyVariables: Record<typeof emailTemplateTypes[number], EmailTemplateVariables> = {
  welcome: { name: "Demo Customer" },
  invoice: { name: "Demo Customer", orderNumber: "ORD-DEMO-001", amountMinor: 5292, currency: "USD" },
  refund: { name: "Demo Customer", orderNumber: "ORD-DEMO-001", amountMinor: 5292, currency: "USD" },
  promotion: {
    name: "Demo Customer",
    offerTitle: "Save on your next portfolio launch",
    offerDescription: "Refresh your portfolio with a polished theme built to help your best work stand out.",
    discountDetails: "20% off eligible themes at Stripe Checkout this week.",
    actionUrl: "https://example.com/themes",
    ctaLabel: "Browse themes",
    expiresAt: "Sunday at 11:59 PM",
  },
};

router.post("/test", rateLimit("email-template-test", 20, 60_000, true), async (req, res, next) => {
  try {
    const input = testEmailSchema.parse(req.body);
    const invoice = input.type === "invoice" ? await createExampleInvoicePdf() : undefined;
    const delivery = await sendEmailTemplate({
      to: input.email,
      type: input.type,
      variables: dummyVariables[input.type],
      ...(invoice ? { attachment: { filename: invoice.filename, content: invoice.pdf } } : {}),
      idempotencyKey: `email-test/${input.type}/${randomUUID()}`,
    });
    await audit(req, "email.test", "email_template", input.type, undefined, { deliveryId: delivery.id });
    res.json({ success: true, data: { id: delivery.id, type: input.type }, message: `${input.type} test email sent` });
  } catch (error) { next(error); }
});

router.post("/promotions", rateLimit("promotion-email", 10, 60_000, true), async (req, res, next) => {
  try {
    const input = promotionSchema.parse(req.body);
    const recipients = await UserModel.find({ _id: { $in: input.userIds }, role: "customer", status: "active", deletedAt: { $exists: false }, marketingOptOutAt: { $exists: false } }).select("name email").lean();
    if (!recipients.length) throw new AppError(422, "NO_ELIGIBLE_RECIPIENTS", "Select at least one active customer");

    const campaignId = randomUUID();
    const sent = await sendPromotionEmails(recipients.map((recipient) => ({ id: String(recipient._id), email: recipient.email, name: recipient.name })), {
      offerTitle: input.offerTitle,
      offerDescription: input.offerDescription,
      discountDetails: input.discountDetails,
      actionUrl: input.actionUrl,
      ctaLabel: input.ctaLabel,
      expiresAt: input.expiresAt,
    }, campaignId);

    await audit(req, "promotion.send", "email_campaign", campaignId, undefined, { offerTitle: input.offerTitle, requested: input.userIds.length, eligible: recipients.length, sent });
    res.json({ success: true, data: { campaignId, sent, failed: 0 }, message: `Promotion sent to ${sent} customers` });
  } catch (error) { next(error); }
});

export default router;

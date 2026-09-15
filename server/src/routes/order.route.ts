import { Router } from "express";
import { requireCustomer, requireDatabaseUser } from "../middlewares/auth.ts";
import { rateLimit } from "../middlewares/rate-limit.ts";
import { checkoutSchema, idSchema, parseOrThrow, stripeSessionSchema } from "../schemas/marketplace.ts";
import { createCheckout } from "../services/checkout.service.ts";
import { getOrderByStripeSessionForUser, getOrderForUser, issueDownload, listOrdersForUser, listPurchases } from "../services/order.service.ts";
import { paidOrderInvoiceForUser } from "../services/pdf.service.ts";

const router = Router();
router.use(requireDatabaseUser);

router.post("/checkout/sessions", requireCustomer, rateLimit("checkout", 12, 60_000, true), async (req, res, next) => {
  try {
    const input = parseOrThrow(checkoutSchema, req.body);
    const checkout = await createCheckout(req.currentUser!, input.idempotencyKey, req.region);
    res.status(201).json({ success: true, data: checkout });
  } catch (error) {
    next(error);
  }
});

router.get("/purchases", requireCustomer, async (req, res, next) => {
  try {
    const [entitlements, orders] = await Promise.all([listPurchases(req.currentUser!._id), listOrdersForUser(req.currentUser!._id)]);
    res.json({ success: true, data: { entitlements, orders } });
  } catch (error) {
    next(error);
  }
});

router.get("/checkout/sessions/:sessionId/order", requireCustomer, async (req, res, next) => {
  try {
    const { sessionId } = parseOrThrow(stripeSessionSchema, req.params);
    res.json({ success: true, data: await getOrderByStripeSessionForUser(req.currentUser!._id, sessionId) });
  } catch (error) {
    next(error);
  }
});

router.get("/orders", requireCustomer, async (req, res, next) => {
  try { res.json({ success: true, data: await listOrdersForUser(req.currentUser!._id) }); } catch (error) { next(error); }
});
router.get("/orders/:id", requireCustomer, async (req, res, next) => {
  try { const { id } = parseOrThrow(idSchema, req.params); res.json({ success: true, data: await getOrderForUser(req.currentUser!._id, id) }); } catch (error) { next(error); }
});
router.get("/orders/:id/invoice", requireCustomer, rateLimit("invoice", 20, 60_000, true), async (req, res, next) => {
  try {
    const { id } = parseOrThrow(idSchema, req.params);
    const invoice = await paidOrderInvoiceForUser(req.currentUser!._id, id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${invoice.filename}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(invoice.pdf);
  } catch (error) { next(error); }
});
router.get("/entitlements", requireCustomer, async (req, res, next) => {
  try { res.json({ success: true, data: await listPurchases(req.currentUser!._id) }); } catch (error) { next(error); }
});
router.post("/entitlements/:id/download", requireCustomer, rateLimit("download", 20, 60_000, true), async (req, res, next) => {
  try {
    const { id } = parseOrThrow(idSchema, req.params);
    res.json({ success: true, data: await issueDownload({ entitlementId: id, userId: req.currentUser!._id, ip: req.ip, userAgent: req.get("user-agent") }) });
  } catch (error) {
    next(error);
  }
});

export default router;

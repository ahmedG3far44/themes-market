import { Router, type Request } from "express";
import env from "../config/env.ts";
import { requireCustomer, requireDatabaseUser } from "../middlewares/auth.ts";
import { rateLimit } from "../middlewares/rate-limit.ts";
import { checkoutSchema, idSchema, parseOrThrow, stripeSessionSchema } from "../schemas/marketplace.ts";
import { createCheckout } from "../services/checkout.service.ts";
import { getOrderByStripeSessionForUser, getOrderForUser, issueDownload, listOrdersForUser, listPurchases } from "../services/order.service.ts";
import { paymentProvidersForCountry } from "../services/payment-provider.service.ts";
import { isPaymobConfigured } from "../services/paymob.service.ts";

const router = Router();
router.use(requireDatabaseUser);

function checkoutCountry(req: Request): string | undefined {
  const detected = req.region?.country && req.region.country !== "Unknown" ? req.region.country.toUpperCase() : undefined;
  return detected ?? (env.NODE_ENV === "development" ? "EG" : undefined);
}

router.get("/checkout/providers", requireCustomer, (req, res, next) => {
  try {
    const country = checkoutCountry(req);
    const providers = paymentProvidersForCountry(country, isPaymobConfigured(country));
    const defaultProvider = providers.includes(env.PAYMENT_PROVIDER) ? env.PAYMENT_PROVIDER : providers[0];
    res.json({ success: true, data: { country: country ?? null, defaultProvider, providers, usdToEgpRate: env.PAYMOB_USD_TO_EGP_RATE } });
  } catch (error) { next(error); }
});

router.post("/checkout/sessions", requireCustomer, rateLimit("checkout", 12, 60_000, true), async (req, res, next) => {
  try {
    const input = parseOrThrow(checkoutSchema, req.body);
    const checkout = await createCheckout(req.currentUser!, input.idempotencyKey, input.provider ?? env.PAYMENT_PROVIDER, checkoutCountry(req));
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

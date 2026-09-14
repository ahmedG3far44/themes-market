import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import env from "../config/env.ts";
import { checkoutSchema, themeInputSchema } from "../schemas/marketplace.ts";
import { validateStripeCheckoutAmounts, verifyStripeSignature } from "../services/stripe.service.ts";
import { assertPaymentProviderAllowed, paymentProvidersForCountry } from "../services/payment-provider.service.ts";
import { verifyPaymobSignature } from "../routes/webhook.route.ts";
import { createCheckout } from "../services/checkout.service.ts";
import { convertUsdMinorToEgpMinor, parsePaymobIntegrationId, paymobCredentials } from "../services/paymob.service.ts";
import { AppError } from "../utils/app-error.ts";

const validTheme = { name: "Studio Grid", slug: "studio-grid", shortDescription: "A considered portfolio for creative studios.", description: "A complete, responsive portfolio theme designed for independent creative studios.", stack: ["React"], features: ["Responsive"], priceMinor: 4900, currency: "usd", version: "1.0.0", previewUrl: "https://preview.example.com", imageAssetIds: ["64b64c16e3a54f0012345678"], videoAssetIds: [], sourceAssetId: "64b64c16e3a54f0012345679", featured: false };

test("theme input preserves integer minor units and normalizes currency", () => {
  const parsed = themeInputSchema.parse(validTheme);
  assert.equal(parsed.priceMinor, 4900);
  assert.equal(parsed.currency, "USD");
});

test("theme preview rejects localhost and non-HTTPS URLs", () => {
  assert.equal(themeInputSchema.safeParse({ ...validTheme, previewUrl: "http://localhost:5173" }).success, false);
});

test("theme input requires a preview asset and source ZIP", () => {
  assert.equal(themeInputSchema.safeParse({ ...validTheme, imageAssetIds: [], videoAssetIds: [] }).success, false);
  assert.equal(themeInputSchema.safeParse({ ...validTheme, sourceAssetId: undefined }).success, false);
});

test("Stripe webhook signatures require the correct signed payload", () => {
  env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  const body = Buffer.from('{"id":"evt_test"}');
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", env.STRIPE_WEBHOOK_SECRET).update(`${timestamp}.${body.toString("utf8")}`).digest("hex");
  assert.equal(verifyStripeSignature(body, `t=${timestamp},v1=${signature}`), true);
  assert.equal(verifyStripeSignature(Buffer.from("changed"), `t=${timestamp},v1=${signature}`), false);
});

test("Stripe checkout reconciliation accepts provider tax without weakening subtotal validation", () => {
  assert.deepEqual(validateStripeCheckoutAmounts({
    amount_subtotal: 11520,
    amount_total: 13133,
    currency: "usd",
    total_details: { amount_discount: 0, amount_shipping: 0, amount_tax: 1613 },
  }, 11520, "USD"), { subtotalMinor: 11520, taxMinor: 1613, totalMinor: 13133, currency: "USD" });

  assert.throws(() => validateStripeCheckoutAmounts({
    amount_subtotal: 11420,
    amount_total: 13019,
    currency: "usd",
    total_details: { amount_discount: 0, amount_shipping: 0, amount_tax: 1599 },
  }, 11520, "USD"), /subtotal does not match/);
});

test("Stripe is global while Paymob remains restricted to configured supported countries", () => {
  for (const country of ["EG", "SA", "OM", "AE"]) assert.deepEqual(paymentProvidersForCountry(country), ["stripe", "paymob"]);
  for (const country of ["US", "GB", "Unknown", undefined]) assert.deepEqual(paymentProvidersForCountry(country), ["stripe"]);
  assert.deepEqual(paymentProvidersForCountry("EG", false), ["stripe"]);
  assert.doesNotThrow(() => assertPaymentProviderAllowed("paymob", "EG"));
  assert.throws(() => assertPaymentProviderAllowed("paymob", "US"), (error: unknown) => error instanceof AppError && error.code === "PAYMOB_REGION_RESTRICTED");
});

test("all supported Paymob countries use the shared credential set", () => {
  const original = { secretKey: env.PAYMOB_SECRET_KEY, publicKey: env.PAYMOB_PUBLIC_KEY, integrationId: env.PAYMOB_INTEGRATION_ID };
  try {
    env.PAYMOB_SECRET_KEY = "shared-secret";
    env.PAYMOB_PUBLIC_KEY = "shared-public";
    env.PAYMOB_INTEGRATION_ID = "42";
    const expectedBaseUrls: Record<string, string> = { EG: "https://accept.paymob.com", SA: "https://ksa.paymob.com", OM: "https://oman.paymob.com", AE: "https://uae.paymob.com" };
    for (const country of ["EG", "SA", "OM", "AE"]) {
      const credentials = paymobCredentials(country);
      assert.equal(credentials?.secretKey, "shared-secret");
      assert.equal(credentials?.publicKey, "shared-public");
      assert.equal(credentials?.integrationId, 42);
      assert.equal(credentials?.baseUrl, expectedBaseUrls[country]);
    }
    assert.equal(paymobCredentials("US"), undefined);
  } finally {
    env.PAYMOB_SECRET_KEY = original.secretKey;
    env.PAYMOB_PUBLIC_KEY = original.publicKey;
    env.PAYMOB_INTEGRATION_ID = original.integrationId;
  }
});

test("Paymob integration IDs must be positive integers", () => {
  assert.equal(parsePaymobIntegrationId("4345907"), 4345907);
  assert.equal(parsePaymobIntegrationId("not-an-integration-id"), undefined);
  assert.equal(parsePaymobIntegrationId("0"), undefined);
});

test("USD minor units convert to EGP minor units using the snapshotted rate", () => {
  assert.equal(convertUsdMinorToEgpMinor(100, 51.37), 5137);
  assert.equal(convertUsdMinorToEgpMinor(11520, 51.37), 591782);
  assert.throws(() => convertUsdMinorToEgpMinor(100, 0), /rate must be positive/);
});

test("checkout accepts only Stripe or Paymob provider selection", () => {
  const idempotencyKey = "e1ec2cf8-53f9-4f3f-8e72-21c50c028295";
  assert.deepEqual(checkoutSchema.parse({ idempotencyKey }), { idempotencyKey });
  assert.equal(checkoutSchema.safeParse({ idempotencyKey, provider: "stripe" }).success, true);
  assert.equal(checkoutSchema.safeParse({ idempotencyKey, provider: "paymob" }).success, true);
  assert.equal(checkoutSchema.safeParse({ idempotencyKey, provider: "paypal" }).success, false);
});

test("administrator accounts cannot create marketplace checkouts", async () => {
  await assert.rejects(
    createCheckout({ _id: "admin-id", email: "admin@example.com", name: "Admin", role: "admin" }, "e1ec2cf8-53f9-4f3f-8e72-21c50c028295", "stripe"),
    (error: unknown) => error instanceof AppError && error.status === 403 && error.code === "ADMIN_PURCHASE_FORBIDDEN",
  );
});

test("Paymob webhook signatures cover the documented transaction fields", () => {
  env.PAYMOB_HMAC_SECRET = "paymob-test-secret";
  const object = { amount_cents: 4900, created_at: "2026-09-14", currency: "USD", error_occured: false, has_parent_transaction: false, id: 42, integration_id: 7, is_3d_secure: true, is_auth: false, is_capture: true, is_refunded: false, is_standalone_payment: true, is_voided: false, order: { id: 11 }, owner: 1, pending: false, source_data: { pan: "2346", sub_type: "MasterCard", type: "card" }, success: true };
  const payload = [4900, "2026-09-14", "USD", false, false, 42, 7, true, false, true, false, true, false, 11, 1, false, "2346", "MasterCard", "card", true].join("");
  const signature = createHmac("sha512", env.PAYMOB_HMAC_SECRET).update(payload).digest("hex");
  assert.equal(verifyPaymobSignature(object, signature), true);
  assert.equal(verifyPaymobSignature({ ...object, amount_cents: 5000 }, signature), false);
});

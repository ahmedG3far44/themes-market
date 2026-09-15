import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import env from "../config/env.ts";
import { checkoutSchema, themeInputSchema, themePatchSchema } from "../schemas/marketplace.ts";
import { validateStripeCheckoutAmounts, verifyStripeSignature } from "../services/stripe.service.ts";
import { createCheckout } from "../services/checkout.service.ts";
import { themeAssetIssues } from "../utils/theme-assets.ts";
import { AppError } from "../utils/app-error.ts";
import { assertInvoicePaid, createInvoicePdf, type InvoiceData } from "../services/pdf.service.ts";

const validTheme = { name: "Studio Grid", slug: "studio-grid", shortDescription: "A considered portfolio for creative studios.", description: "A complete, responsive portfolio theme designed for independent creative studios.", stack: ["React"], features: ["Responsive"], priceMinor: 4900, currency: "usd", version: "1.0.0", previewUrl: "https://preview.example.com", previewAssetId: "64b64c16e3a54f0012345670", imageAssetIds: ["64b64c16e3a54f0012345678", "64b64c16e3a54f0012345677"], videoAssetIds: ["64b64c16e3a54f0012345676"], sourceAssetId: "64b64c16e3a54f0012345679", featured: false };

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

test("checkout does not accept a client-selected payment provider", () => {
  const idempotencyKey = "e1ec2cf8-53f9-4f3f-8e72-21c50c028295";
  assert.deepEqual(checkoutSchema.parse({ idempotencyKey }), { idempotencyKey });
  assert.equal(checkoutSchema.safeParse({ idempotencyKey, provider: "stripe" }).success, false);
  assert.equal(checkoutSchema.safeParse({ idempotencyKey, provider: "paypal" }).success, false);
});

test("administrator accounts cannot create marketplace checkouts", async () => {
  await assert.rejects(
    createCheckout({ _id: "admin-id", email: "admin@example.com", name: "Admin", role: "admin" }, "e1ec2cf8-53f9-4f3f-8e72-21c50c028295"),
    (error: unknown) => error instanceof AppError && error.status === 403 && error.code === "ADMIN_PURCHASE_FORBIDDEN",
  );
});

test("invoice PDFs are generated only for paid orders", async () => {
  assert.throws(() => assertInvoicePaid("pending"), (error: unknown) => error instanceof AppError && error.code === "INVOICE_NOT_AVAILABLE");
  const invoice = {
    order: {
      _id: "64b64c16e3a54f0012345679", orderNumber: "ORD-20260915-DEMO", userId: "64b64c16e3a54f0012345671", status: "paid", paymentProvider: "stripe",
      checkoutKey: "invoice-test", currency: "USD", subtotalMinor: 9800, discountMinor: 980, taxMinor: 706, totalMinor: 9526,
      discountSnapshot: { code: "WELCOME10", percentage: 10 }, paidAt: new Date("2026-09-15T10:05:00Z"), createdAt: new Date("2026-09-15T10:00:00Z"), updatedAt: new Date("2026-09-15T10:05:00Z"),
      items: [
        { _id: "64b64c16e3a54f0012345672", themeId: "64b64c16e3a54f0012345673", sourceAssetId: "64b64c16e3a54f0012345674", name: "Studio Grid", slug: "studio-grid", version: "1.0.0", priceMinor: 4900, discountMinor: 490, totalMinor: 4410 },
        { _id: "64b64c16e3a54f0012345675", themeId: "64b64c16e3a54f0012345676", sourceAssetId: "64b64c16e3a54f0012345677", name: "Motion Folio", slug: "motion-folio", version: "2.1.0", priceMinor: 4900, discountMinor: 490, totalMinor: 4410 },
      ],
    },
    customer: { name: "Ahmed Customer", email: "customer@example.com", phone: "+20 100 000 0000" },
    region: { city: "Cairo", region: "C", country: "EG", timezone: "Africa/Cairo" },
  } as unknown as InvoiceData;
  const pdf = await createInvoicePdf(invoice);
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.ok(pdf.length > 3_000);
});


test("theme media limits apply to creation and partial updates", () => {
  const ids = (count: number) => Array.from({ length: count }, (_, index) => index.toString(16).padStart(24, "0"));
  for (const count of [0, 1, 11]) {
    assert.equal(themeInputSchema.safeParse({ ...validTheme, imageAssetIds: ids(count) }).success, false);
    assert.equal(themePatchSchema.safeParse({ imageAssetIds: ids(count) }).success, false);
  }
  for (const count of [2, 10]) assert.equal(themeInputSchema.safeParse({ ...validTheme, imageAssetIds: ids(count) }).success, true);
  for (const count of [0, 3]) {
    assert.equal(themeInputSchema.safeParse({ ...validTheme, videoAssetIds: ids(count) }).success, false);
    assert.equal(themePatchSchema.safeParse({ videoAssetIds: ids(count) }).success, false);
  }
  assert.equal(themeInputSchema.safeParse({ ...validTheme, videoAssetIds: ids(2) }).success, true);
  assert.equal(themeInputSchema.safeParse({ ...validTheme, previewAssetId: undefined }).success, false);
  assert.equal(themeInputSchema.safeParse({ ...validTheme, previewAssetId: validTheme.videoAssetIds[0] }).success, false);
  assert.equal(themePatchSchema.safeParse({ setupInstructions: "", deployInstructions: "", instructionsFormat: "html" }).success, true);
});

test("theme assets require the correct roles, ready status, and distinct files", () => {
  const assets = new Map([
    [validTheme.previewAssetId, { kind: "video", contentType: "video/mp4", status: "ready" }],
    ...validTheme.imageAssetIds.map((id) => [id, { kind: "image", contentType: "image/png", status: "ready" }] as const),
    [validTheme.videoAssetIds[0]!, { kind: "video", contentType: "video/webm", status: "ready" }],
    [validTheme.sourceAssetId, { kind: "theme_zip", contentType: "application/zip", status: "ready" }],
  ]);
  assert.deepEqual(themeAssetIssues(validTheme, assets), []);
  assets.set(validTheme.previewAssetId, { kind: "image", contentType: "image/gif", status: "ready" });
  assert.deepEqual(themeAssetIssues(validTheme, assets), []);
  assets.set(validTheme.previewAssetId, { kind: "image", contentType: "image/png", status: "ready" });
  assert.equal(themeAssetIssues(validTheme, assets)[0]?.path[0], "previewAssetId");
  assets.set(validTheme.previewAssetId, { kind: "video", contentType: "video/webm", status: "ready" });
  assert.deepEqual(themeAssetIssues(validTheme, assets), []);
  assets.set(validTheme.imageAssetIds[0]!, { kind: "image", contentType: "image/png", status: "processing" });
  assert.equal(themeAssetIssues(validTheme, assets)[0]?.path[0], "imageAssetIds");
  assets.set(validTheme.imageAssetIds[0]!, { kind: "image", contentType: "image/png", status: "ready" });
  assert.ok(themeAssetIssues({ ...validTheme, videoAssetIds: [validTheme.previewAssetId] }, assets).some((issue) => issue.path[0] === "previewAssets"));
  assets.delete(validTheme.videoAssetIds[0]!);
  assert.ok(themeAssetIssues(validTheme, assets).some((issue) => issue.path[0] === "videoAssetIds"));
  assets.delete(validTheme.sourceAssetId);
  assert.ok(themeAssetIssues(validTheme, assets).some((issue) => issue.path[0] === "sourceAssetId"));
});

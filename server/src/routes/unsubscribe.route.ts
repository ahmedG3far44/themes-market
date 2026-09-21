import { Router } from "express";
import { z } from "zod";
import { rateLimit } from "../middlewares/rate-limit.ts";
import { unsubscribeFromMarketing } from "../services/email.service.ts";

const router = Router();
const inputSchema = z.object({ token: z.string().min(20).max(500) });

function confirmationPage(success: boolean): string {
  const title = success ? "You are unsubscribed" : "This link is not valid";
  const message = success
    ? "You will no longer receive promotional offers from Foliokit. Account, purchase, invoice, and refund emails are not affected."
    : "We could not process this unsubscribe link. Please contact Foliokit support for help.";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="margin:0;background:#f4f5f3;color:#1a1a1a;font-family:Arial,Helvetica,sans-serif"><main style="max-width:560px;margin:72px auto;padding:0 20px"><section style="background:#fff;border:1px solid #e2e6e3;border-radius:14px;padding:40px"><p style="font-weight:800;letter-spacing:.08em">FOLIOKIT</p><h1 style="font-size:30px">${title}</h1><p style="color:#5f6762;line-height:1.7">${message}</p></section></main></body></html>`;
}

async function processUnsubscribe(token: unknown): Promise<boolean> {
  const parsed = inputSchema.safeParse({ token });
  return parsed.success ? unsubscribeFromMarketing(parsed.data.token) : false;
}

router.get("/unsubscribe", rateLimit("email-unsubscribe", 30, 60_000), async (req, res) => {
  const success = await processUnsubscribe(req.query.token);
  res.status(success ? 200 : 400).type("html").send(confirmationPage(success));
});

router.post("/unsubscribe", rateLimit("email-unsubscribe", 30, 60_000), async (req, res) => {
  const success = await processUnsubscribe(req.query.token ?? req.body?.token);
  res.status(success ? 200 : 400).json({ success });
});

export default router;

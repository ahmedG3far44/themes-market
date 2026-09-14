import cors from 'cors';
import helmet from 'helmet';
import express from 'express'
import mongoose from 'mongoose';
import env from './config/env.ts';
import mainRoutes from './routes/main.route.ts'

import { clerkMiddleware } from '@clerk/express'
import { verifyRegion } from './middlewares/verifyRegion.ts';
import { connectDatabase } from './config/database.ts';
import { errorHandler, notFound, requestContext } from './middlewares/error.ts';
import { paymobWebhookHandler, stripeWebhookHandler } from './routes/webhook.route.ts';


const app = express()
const PORT = env.PORT;

app.set('trust proxy', true);
app.use(requestContext);
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

app.use(cors({ origin: env.CLIENT_URL.split(",").map((value) => value.trim()), credentials: true }));

app.use(verifyRegion);
app.use(clerkMiddleware({
  publishableKey: env.CLERK_PUBLISHABLE_KEY,
  secretKey: env.CLERK_SECRET_KEY,
}));

app.post("/api/v1/webhooks/stripe", express.raw({ type: "application/json", limit: "256kb" }), stripeWebhookHandler);
// app.post("/api/v1/webhooks/clerk", express.raw({ type: "application/json", limit: "256kb" }), clerkWebhookHandler);
app.use(express.json({ limit: "1mb" }));
app.post("/api/v1/webhooks/paymob", paymobWebhookHandler);

app.get("/health/live", (_req, res) => { res.json({ status: "ok" }); });
app.get("/health/ready", (_req, res) => {
  const ready = mongoose.connection.readyState === 1;
  res.status(ready ? 200 : 503).json({ status: ready ? "ready" : "not_ready", database: ready ? "connected" : "disconnected" });
});


app.use("/api/v1", mainRoutes)
app.use(notFound);
app.use(errorHandler);

connectDatabase()
  .then(() => app.listen(PORT, () => console.log(`Server listening at http://localhost:${PORT}`)))
  .catch((error) => {
    console.error("Unable to start server", error);
    process.exit(1);
  });

export default app;

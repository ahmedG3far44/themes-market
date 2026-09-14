# Portfolio Theme Marketplace

A single-vendor marketplace for production-ready portfolio templates. Visitors browse published themes, customers buy through Stripe globally or Paymob in supported MENA markets, and administrators manage themes, users, orders, discounts, uploads, and revenue analytics.

## Local setup

1. Copy `server/.env.example` to `server/.env`, set `PAYMENT_PROVIDER` to `stripe` or `paymob`, and configure MongoDB, Clerk, the selected payment provider, and Cloudflare R2.
2. Create `client/.env` with `VITE_CLERK_PUBLISHABLE_KEY` and `VITE_BASE_URL=http://localhost:3000/api/v1`.
3. Run `npm install` in both `server` and `client`.
4. Start the API with `npm run dev` in `server`, then the UI with `npm run dev` in `client`.

The API health endpoints are `GET /health/live` and `GET /health/ready`.

## Create the first administrator

First create the account in Clerk. Set `ADMIN_EMAIL` to the exact Clerk email and optionally set `ADMIN_CLERK_USER_ID`, then run from `server`:

```sh
npm run seed
```

The seed is idempotent and deliberately fails if it cannot resolve a real Clerk identity. It never creates an unlinked database-only administrator. It also adds six draft themes with external placeholder images. A source ZIP is optional when publishing, but a theme cannot be purchased until its ZIP is ready. Sign in through `/sign-in`; the restored Clerk session is synchronized into MongoDB, and an admin is then routed to `/admin`.

## Cloudflare R2 storage and payments

- Set `CLOUDFLARE_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET`. Runtime credentials need Object Read & Write access to that bucket.
- Run `npm run r2:setup` from `server` once with R2 Admin Read & Write credentials to configure browser upload CORS for `CLIENT_URL` and expose the `ETag` header. You can replace them with bucket-scoped Object Read & Write credentials afterward.
- The R2 bucket stays private. The API returns temporary signed preview URLs for images and videos; theme ZIP keys are never returned, and downloads always use shorter-lived signed URLs.
- Set Stripe's webhook endpoint to `POST /api/v1/webhooks/stripe` for `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, and `checkout.session.expired`.
- Customers can select Stripe or Paymob in the cart. `PAYMENT_PROVIDER` sets the initially selected method. Paymob remains server-restricted to IP regions `EG`, `SA`, `OM`, and `AE` and converts USD totals to EGP using the server-side `PAYMOB_USD_TO_EGP_RATE` snapshot.
- Configure one shared set of `PAYMOB_SECRET_KEY`, `PAYMOB_PUBLIC_KEY`, `PAYMOB_INTEGRATION_ID`, and `PAYMOB_HMAC_SECRET` values for all supported countries, and set `PAYMOB_WEBHOOK_URL` to the public `POST /api/v1/webhooks/paymob` endpoint.
- Only a verified processor webhook with the expected amount and currency grants entitlements. Returning to the success page never grants a download.

## Admin workspace

The `/admin` workspace includes paid-order insights, account access/role management, portfolio theme drafting and publishing, multipart asset uploads, marketplace order inspection, percentage discounts, and the existing subscription-plan/legacy-transaction tools. Themes with paid sales are archived instead of deleted, and user removal retains anonymized financial records.

## Verification

Run `npm run build` in both packages and `npm run lint` in `client` before deployment.

import dotenv from "dotenv";

dotenv.config();

const env = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: Number(process.env.PORT ?? 3000),

  CLIENT_URL: process.env.CLIENT_URL ?? "http://localhost:5173",
  MONGODB_URI: process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/saas",

  CLERK_PUBLISHABLE_KEY: process.env.CLERK_PUBLISHABLE_KEY ?? "",
  CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY ?? "",
  CLERK_WEBHOOK_SECRET: process.env.CLERK_WEBHOOK_SECRET ?? "",

  ADMIN_EMAIL: process.env.ADMIN_EMAIL ?? "ahmedjaafarbadri@gmail.com",
  ADMIN_NAME: process.env.ADMIN_NAME ?? "System Admin",
  ADMIN_CLERK_ID: process.env.ADMIN_CLERK_USER_ID ?? process.env.ADMIN_CLERK_ID ?? "",

  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ?? process.env.STRIPE_KEY_SECRETS ?? "",
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET ?? process.env.STRIPE_WEBHOOK_SECRETS ?? "",

  RESEND_API_KEY: process.env.RESEND_API_KEY ?? "",
  EMAIL_FROM: process.env.EMAIL_FROM ?? "My SaaS <onboarding@example.com>",

  R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID ?? process.env.CLOUDFLARE_ACCOUNT_ID ?? "",
  R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID ?? "",
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY ?? "",
  R2_BUCKET: process.env.R2_BUCKET ?? "",
  R2_MEDIA_URL_TTL_SECONDS: Math.min(604_800, Math.max(300, Number(process.env.R2_MEDIA_URL_TTL_SECONDS ?? 3600))),
  R2_DOWNLOAD_URL_TTL_SECONDS: Math.min(900, Math.max(60, Number(process.env.R2_DOWNLOAD_URL_TTL_SECONDS ?? 90))),
  MAX_IMAGE_SIZE_MB: Number(process.env.MAX_IMAGE_SIZE_MB ?? 10),
  MAX_VIDEO_SIZE_MB: Number(process.env.MAX_VIDEO_SIZE_MB ?? 250),
  MAX_THEME_ZIP_SIZE_MB: Number(process.env.MAX_THEME_ZIP_SIZE_MB ?? 100),
};


export default env;

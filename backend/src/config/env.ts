import { config as loadEnv } from "dotenv";
import path from "node:path";
import { z } from "zod";

// backend/src/config -> repo root is three levels up (same depth from backend/dist/config after build)
loadEnv({ path: path.resolve(__dirname, "../../../.env"), quiet: true });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGO_URI: z.string().min(1, "MONGO_URI is required"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),
  JWT_ACCESS_SECRET: z.string().min(16, "JWT_ACCESS_SECRET must be a long random value"),
  JWT_REFRESH_SECRET: z.string().min(16, "JWT_REFRESH_SECRET must be a long random value"),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),
  // The frontend's origin when it is NOT the API's own (dev: Next on :3000,
  // API on :4000). Leave unset for same-origin deploys (Vercel, Docker+Nginx):
  // cross-origin requests are then refused, and sockets accept same-origin only.
  CORS_ORIGIN: z
    .string()
    .optional()
    .transform((value) => value || undefined)
    .pipe(z.string().url("CORS_ORIGIN must be a valid URL").optional()),
  // Unset (or empty) → host-only cookies, scoped to exactly the host that set
  // them. That's what a same-origin deploy wants (Vercel, Docker+Nginx): every
  // preview URL gets its own cookies, with no Domain to configure.
  COOKIE_DOMAIN: z
    .string()
    .optional()
    .transform((value) => value || undefined),
  // Where links in emails point (password reset, …). Never taken from the
  // request's Host header: a forged Host would mail out a link to an
  // attacker's site carrying a real reset token. Falls back to CORS_ORIGIN
  // (dev), then Vercel's own system variables (see appUrl below).
  APP_URL: z
    .string()
    .optional()
    .transform((value) => value || undefined)
    .pipe(z.string().url("APP_URL must be a valid URL").optional()),
  // Outgoing mail over SMTP: Mailtrap's sandbox in dev, Brevo in production.
  // Unset: dev prints emails to the console, production refuses to send.
  SMTP_URL: z
    .string()
    .optional()
    .transform((value) => value || undefined),
  // Brevo only sends from a sender address verified in its dashboard, so
  // production must set this to that address. Mailtrap accepts anything.
  MAIL_FROM: z.string().min(1).default("FlowSync <no-reply@flowsync.test>"),
  // Vercel system variables (set by the platform, not by us).
  VERCEL_ENV: z.string().optional(),
  VERCEL_URL: z.string().optional(),
  VERCEL_PROJECT_PRODUCTION_URL: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:");
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === "production";

// Base URL for links in emails, without a trailing slash. On Vercel, production
// links use the stable production domain and previews their own deployment URL.
export const appUrl: string | undefined = (() => {
  const url =
    env.APP_URL ??
    env.CORS_ORIGIN ??
    (env.VERCEL_ENV === "production" && env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`
      : env.VERCEL_URL
        ? `https://${env.VERCEL_URL}`
        : undefined);
  return url?.replace(/\/$/, "");
})();

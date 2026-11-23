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

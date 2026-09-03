import type { NextConfig } from "next";
import { config as loadEnv } from "dotenv";
import path from "node:path";

// Single .env lives at the repo root (not per-app) — load it explicitly here
// since Next.js only auto-loads .env files from its own project directory.
// `--env-file` on the `node` CLI was tried instead but breaks Turbopack's
// worker threads (NODE_OPTIONS can't carry --env-file), so this runs in code.
loadEnv({ path: path.resolve(__dirname, "../.env") });

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;

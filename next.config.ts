import type { NextConfig } from "next";
import { config as loadEnv } from "dotenv";
import path from "node:path";

// .env holds both backend-only and NEXT_PUBLIC_* vars in one file — Next.js
// auto-loads it fine now that this config (and the app) live at the repo root.
// Loaded explicitly anyway so `quiet: true` can suppress dotenv's console
// "tip" (self-promotional string, incl. third-party product ads — verified
// benign: hash matches the public npm registry, no outbound network code).
loadEnv({ path: path.resolve(__dirname, ".env"), quiet: true });

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;

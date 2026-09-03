import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next — paths relative to this file
    // (repo root), not to frontend/ where the Next.js app actually lives.
    "frontend/.next/**",
    "frontend/out/**",
    "build/**",
    "frontend/next-env.d.ts",
  ]),
]);

export default eslintConfig;

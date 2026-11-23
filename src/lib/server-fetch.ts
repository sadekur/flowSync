import "server-only";
import { cookies } from "next/headers";

/**
 * Where Server Components reach the API. A server-side fetch needs an absolute
 * URL, so the browser's relative `/api` (same-origin deploys) won't do:
 * - Vercel: BACKEND_INTERNAL_URL, injected at runtime by the `web` → `api`
 *   service binding in vercel.json (private, deployment-aware).
 * - Docker: BACKEND_INTERNAL_URL=http://backend:4000 on the compose network.
 * - Dev: NEXT_PUBLIC_API_URL (http://localhost:4000).
 * Read per call, not at module load: bindings only exist at runtime.
 */
function apiBaseUrl(): string {
  const url = process.env.BACKEND_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL;
  if (!url) throw new Error("Set BACKEND_INTERNAL_URL or NEXT_PUBLIC_API_URL for server-side API calls");
  return url.replace(/\/$/, "");
}

// Server Components run their own outgoing HTTP request to the backend, so
// the browser's cookies (httpOnly ones included) must be forwarded by hand.
export async function serverFetch(path: string, init?: RequestInit): Promise<Response> {
  const cookieStore = await cookies();

  return fetch(`${apiBaseUrl()}${path}`, {
    ...init,
    headers: { ...init?.headers, cookie: cookieStore.toString() },
    cache: "no-store",
  });
}

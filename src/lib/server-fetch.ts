import "server-only";
import { cookies } from "next/headers";

const API_URL = process.env.NEXT_PUBLIC_API_URL as string;

// Server Components run their own outgoing HTTP request to the backend, so
// the browser's cookies (httpOnly ones included) must be forwarded by hand.
export async function serverFetch(path: string, init?: RequestInit): Promise<Response> {
  const cookieStore = await cookies();

  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: { ...init?.headers, cookie: cookieStore.toString() },
    cache: "no-store",
  });
}

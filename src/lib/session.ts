import "server-only";
import { cache } from "react";
import { serverFetch } from "./server-fetch";
import type { User } from "@/types/api";

// Memoized per request (React `cache`) so every Server Component on a page
// that needs the current user shares one `/api/auth/me` call.
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const res = await serverFetch("/api/auth/me");
  if (!res.ok) return null;

  const data = (await res.json()) as { user: User };
  return data.user;
});

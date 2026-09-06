"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/client-api";
import { useAppDispatch } from "@/store/hooks";
import { setUser } from "@/store/authSlice";

export function LogoutButton() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const [pending, setPending] = useState(false);

  async function handleLogout(): Promise<void> {
    setPending(true);
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Cookies only truly matter server-side; fall through to reset local
      // state regardless of a network hiccup on the logout call itself.
    } finally {
      dispatch(setUser(null));
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <button
      onClick={handleLogout}
      disabled={pending}
      className="rounded-md border border-black/10 px-3 py-1.5 text-sm hover:bg-black/5 disabled:opacity-50 dark:border-white/10 dark:hover:bg-white/5"
    >
      Log out
    </button>
  );
}

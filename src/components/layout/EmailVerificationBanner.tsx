"use client";

import { useState } from "react";
import { apiFetch, ApiError } from "@/lib/client-api";

/** Shown to users who haven't verified their email. A reminder, not a lock. */
export function EmailVerificationBanner({ email }: { email: string }) {
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleResend(): Promise<void> {
    setError(null);
    setStatus("sending");
    try {
      await apiFetch<{ message: string }>("/api/auth/resend-verification", { method: "POST" });
      setStatus("sent");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
      setStatus("idle");
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-amber-300 bg-amber-50 px-6 py-2 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
      <span>
        Please confirm your email address, <b className="break-all">{email}</b>, using the link we sent you.
      </span>
      {status === "sent" ? (
        <span role="status">Sent. Check your inbox, and your spam folder.</span>
      ) : (
        <button
          type="button"
          onClick={handleResend}
          disabled={status === "sending"}
          className="font-medium underline disabled:opacity-50"
        >
          {status === "sending" ? "Sending…" : "Resend email"}
        </button>
      )}
      {error && (
        <span role="alert" className="text-red-700 dark:text-red-300">
          {error}
        </span>
      )}
    </div>
  );
}

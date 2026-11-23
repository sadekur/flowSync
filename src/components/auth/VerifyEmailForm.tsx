"use client";

import { useState } from "react";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/client-api";
import { useHashToken } from "@/lib/useHashToken";

// Waits for a click instead of verifying on load: some mail scanners open
// links, and even run their scripts, to check them. Verifying on load would
// let a scanner confirm an address its owner never confirmed.
export function VerifyEmailForm() {
  const { token, stripTokenFromUrl } = useHashToken();
  const [status, setStatus] = useState<"idle" | "pending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm(): Promise<void> {
    stripTokenFromUrl();
    setError(null);
    setStatus("pending");
    try {
      await apiFetch<{ message: string }>("/api/auth/verify-email", {
        method: "POST",
        body: JSON.stringify({ token }),
      });
      setStatus("done");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
      setStatus("idle");
    }
  }

  if (token === undefined) return null;

  if (token === null) {
    return (
      <p className="max-w-sm text-center text-sm">
        This page needs the link from your verification email. To get a new one, log in and use{" "}
        <b>Resend email</b> on the banner.{" "}
        <Link href="/dashboard" className="font-medium underline">
          Go to FlowSync
        </Link>
      </p>
    );
  }

  if (status === "done") {
    return (
      <div className="flex max-w-sm flex-col items-center gap-4 text-center text-sm">
        <p role="status">Your email is verified. Thanks!</p>
        <Link href="/dashboard" className="rounded-md bg-foreground px-4 py-2 font-medium text-background">
          Continue to FlowSync
        </Link>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-4 text-center">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">Confirm that this email address belongs to you.</p>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <button
        type="button"
        onClick={handleConfirm}
        disabled={status === "pending"}
        className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
      >
        {status === "pending" ? "Confirming…" : "Confirm my email"}
      </button>
    </div>
  );
}

"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/client-api";
import { PasswordInput } from "./PasswordInput";

const MIN_PASSWORD_LENGTH = 8;

/** Reads `#token=…` from the URL fragment (never sent to any server). */
function readTokenFromHash(): string | null {
  const params = new URLSearchParams(window.location.hash.slice(1));
  return params.get("token");
}

export function ResetPasswordForm() {
  const router = useRouter();
  // undefined until the effect has read the fragment (it isn't available
  // during server rendering), then the token or null.
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const found = readTokenFromHash();
    if (!found) {
      // Keep a token an earlier run already took (Strict Mode runs this
      // effect twice in dev).
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the fragment only exists in the browser
      setToken((current) => current ?? null);
      return;
    }
    setToken(found);
    // Drop the token from the address bar once it's in memory. Deferred a
    // tick: on first load the Next.js router syncs history in its own mount
    // effect, which runs after this one and would write the hash back.
    const strip = setTimeout(() => window.history.replaceState(null, "", window.location.pathname), 0);
    return () => clearTimeout(strip);
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (password !== confirm) {
      setError("The two passwords don't match");
      return;
    }
    setError(null);
    setPending(true);

    try {
      await apiFetch<{ message: string }>("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      // replace, not push: the history entry this page holds is gone, so Back
      // can't return to it. If this browser was logged in as the same
      // account, the API just cleared its cookies; refresh to hydrate that.
      router.replace("/login?reset=1");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
      setPending(false);
    }
  }

  if (token === undefined) return null;

  if (token === null) {
    return (
      <p className="max-w-sm text-center text-sm">
        This page needs the link from your reset email.{" "}
        <Link href="/forgot-password" className="font-medium underline">
          Request a new link
        </Link>
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium">
          New password
        </label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15 dark:bg-transparent"
        />
        <p className="text-xs text-zinc-500">At least {MIN_PASSWORD_LENGTH} characters.</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="confirm" className="text-sm font-medium">
          Confirm new password
        </label>
        <PasswordInput
          id="confirm"
          name="confirm"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15 dark:bg-transparent"
        />
      </div>
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">
          {error}
          {error.includes("expired") && (
            <>
              {" "}
              <Link href="/forgot-password" className="font-medium underline">
                Request a new link
              </Link>
            </>
          )}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
      >
        {pending ? "Saving…" : "Set new password"}
      </button>
    </form>
  );
}

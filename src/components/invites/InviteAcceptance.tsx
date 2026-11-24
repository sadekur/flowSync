"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/client-api";
import { useHashToken } from "@/lib/useHashToken";
import { LoginForm } from "@/components/auth/LoginForm";
import { RegisterForm, type RegisterResponse } from "@/components/auth/RegisterForm";
import type { InvitePreview, JoinedWorkspace, User } from "@/types/api";

type Lookup = { status: "loading" } | { status: "ok"; invite: InvitePreview } | { status: "error"; message: string };

function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : "Something went wrong";
}

/**
 * The page an invite email links to. Looking the invite up only reads, so a
 * mail scanner opening the link changes nothing. Joining needs a session for
 * the invited address: a new account made here, a login, or the session the
 * browser already has.
 */
export function InviteAcceptance({ user: initialUser }: { user: User | null }) {
  const router = useRouter();
  const { token, stripTokenFromUrl } = useHashToken();
  const [lookup, setLookup] = useState<Lookup>({ status: "loading" });
  const [user, setUser] = useState(initialUser);
  const [mode, setMode] = useState<"register" | "login">("register");
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    apiFetch<{ invite: InvitePreview }>("/api/invites/lookup", { method: "POST", body: JSON.stringify({ token }) })
      .then(({ invite }) => !cancelled && setLookup({ status: "ok", invite }))
      .catch((err: unknown) => !cancelled && setLookup({ status: "error", message: errorMessage(err) }));
    return () => {
      cancelled = true;
    };
  }, [token]);

  function goToDashboard(): void {
    router.push("/dashboard");
    router.refresh();
  }

  async function accept(): Promise<void> {
    setError(null);
    setJoining(true);
    try {
      await apiFetch<{ workspace: JoinedWorkspace }>("/api/invites/accept", {
        method: "POST",
        body: JSON.stringify({ token }),
      });
      goToDashboard();
    } catch (err) {
      setError(errorMessage(err));
      setJoining(false);
    }
  }

  function handleLoggedIn(loggedIn: User): void {
    setUser(loggedIn);
    void accept();
  }

  function handleRegistered(response: RegisterResponse): void {
    if (response.workspace) {
      goToDashboard();
      return;
    }
    // The account exists either way; say why the invite didn't work.
    setUser(response.user);
    setError(response.inviteError ?? "The invite couldn't be accepted.");
  }

  if (token === undefined) return null;

  if (token === null) {
    return (
      <p className="max-w-sm text-center text-sm">
        This page needs the link from your invite email. If it has expired, ask the workspace owner to invite you
        again.
      </p>
    );
  }

  if (lookup.status === "loading") {
    return <p className="text-sm text-zinc-600 dark:text-zinc-400">Loading your invite…</p>;
  }

  if (lookup.status === "error") {
    return (
      <p role="alert" className="max-w-sm text-center text-sm text-red-600 dark:text-red-400">
        {lookup.message}
      </p>
    );
  }

  const { invite } = lookup;
  const errorBox = error && (
    <p role="alert" className="max-w-sm text-center text-sm text-red-600 dark:text-red-400">
      {error}
    </p>
  );

  return (
    // The first focus anywhere strips the token from the address bar (see useHashToken).
    <div onFocusCapture={stripTokenFromUrl} className="flex w-full max-w-sm flex-col items-center gap-5">
      <p className="text-center text-sm">
        <b>{invite.invitedByName}</b> invited <b>{invite.email}</b> to join <b>{invite.workspaceName}</b>.
      </p>

      {user && user.email === invite.email && (
        <>
          {errorBox}
          <button
            type="button"
            onClick={accept}
            disabled={joining}
            className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
          >
            {joining ? "Joining…" : `Join ${invite.workspaceName}`}
          </button>
        </>
      )}

      {user && user.email !== invite.email && (
        <>
          {errorBox}
          <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">
            You&apos;re logged in as <b>{user.email}</b>. To accept, log out, then open the link from the email again
            and use the invited address.
          </p>
          <Link href="/dashboard" className="text-sm font-medium underline">
            Go to your dashboard
          </Link>
        </>
      )}

      {!user && (
        <>
          {errorBox}
          {mode === "register" ? (
            <>
              <RegisterForm invite={{ token, email: invite.email }} onRegistered={handleRegistered} />
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Already have an account?{" "}
                <button type="button" onClick={() => setMode("login")} className="font-medium underline">
                  Log in instead
                </button>
              </p>
            </>
          ) : (
            <>
              <LoginForm fixedEmail={invite.email} onLoggedIn={handleLoggedIn} />
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                New to FlowSync?{" "}
                <button type="button" onClick={() => setMode("register")} className="font-medium underline">
                  Create an account
                </button>
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}

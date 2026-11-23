"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/** Reads `#token=…` from the URL fragment (never sent to any server). */
function readTokenFromHash(): string | null {
  const params = new URLSearchParams(window.location.hash.slice(1));
  return params.get("token");
}

/**
 * The token from an emailed link's `#token=…` fragment: undefined until the
 * effect has read it (the fragment doesn't exist during server rendering),
 * then the token or null.
 *
 * `stripTokenFromUrl` drops it from the address bar. Call it on the user's
 * first interaction, not on mount: the Next.js router rewrites the URL from
 * its own state while it starts up, and in the browser that put a stripped
 * hash straight back (both via window.history and router.replace). Once the
 * page is interactive the router has settled.
 */
export function useHashToken(): { token: string | null | undefined; stripTokenFromUrl: () => void } {
  const router = useRouter();
  const [token, setToken] = useState<string | null | undefined>(undefined);

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
  }, []);

  function stripTokenFromUrl(): void {
    if (window.location.hash) router.replace(window.location.pathname, { scroll: false });
  }

  return { token, stripTokenFromUrl };
}

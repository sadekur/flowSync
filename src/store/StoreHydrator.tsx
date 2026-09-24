"use client";

import { useEffect } from "react";
import { useAppDispatch } from "./hooks";
import { setUser } from "./authSlice";
import { socketConnect, socketDisconnect } from "./socketSlice";
import type { User } from "@/types/api";

// Seeds Redux from the server-fetched user on mount — the one client
// boundary allowed to touch auth state directly, per DECISIONS.md. The
// socket connection follows auth: connected whenever a user is signed in.
export function StoreHydrator({ user }: { user: User | null }) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    dispatch(setUser(user));
    dispatch(user ? socketConnect() : socketDisconnect());
  }, [dispatch, user]);

  return null;
}

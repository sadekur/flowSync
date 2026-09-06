"use client";

import { useEffect } from "react";
import { useAppDispatch } from "./hooks";
import { setUser } from "./authSlice";
import type { User } from "@/types/api";

// Seeds Redux from the server-fetched user on mount — the one client
// boundary allowed to touch auth state directly, per DECISIONS.md.
export function StoreHydrator({ user }: { user: User | null }) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    dispatch(setUser(user));
  }, [dispatch, user]);

  return null;
}

"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/client-api";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  allMarkedRead,
  notificationsHydrated,
  selectAllNotifications,
} from "@/store/notificationsSlice";
import { NotificationItem } from "./NotificationItem";
import type { Notification } from "@/types/api";

export function NotificationBell() {
  const dispatch = useAppDispatch();
  const notifications = useAppSelector(selectAllNotifications);
  const unreadCount = useAppSelector((s) => s.notifications.unreadCount);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Seed from the server on mount; live ones then arrive over the socket (the
  // `user:{id}` room), so this is not a poll.
  useEffect(() => {
    let cancelled = false;
    apiFetch<{ notifications: Notification[]; unreadCount: number }>("/api/notifications")
      .then((res) => {
        if (!cancelled) dispatch(notificationsHydrated(res));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [dispatch]);

  // Close the dropdown on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    function onMouseDown(event: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function toggle(): void {
    const next = !open;
    setOpen(next);
    // Mark-all-on-open: one call, then clear the badge from the server result.
    if (next && unreadCount > 0) {
      apiFetch("/api/notifications/read", { method: "POST" })
        .then(() => dispatch(allMarkedRead()))
        .catch(() => {});
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : "Notifications"}
        aria-haspopup="menu"
        aria-expanded={open}
        className="relative rounded-md border border-black/10 p-1.5 text-zinc-600 hover:bg-black/5 dark:border-white/10 dark:text-zinc-400 dark:hover:bg-white/5"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
        >
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-medium text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-10 mt-2 w-80 rounded-lg border border-black/10 bg-background p-1 shadow-lg dark:border-white/10"
        >
          {notifications.length === 0 ? (
            <p className="px-3 py-4 text-sm text-zinc-500 dark:text-zinc-400">No notifications yet.</p>
          ) : (
            <ul className="flex max-h-96 flex-col overflow-y-auto">
              {notifications.map((notification) => (
                <NotificationItem key={notification._id} notification={notification} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

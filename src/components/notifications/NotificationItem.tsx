"use client";

import { memo } from "react";
import Link from "next/link";
import type { Notification } from "@/types/api";

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

function relativeTime(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return rtf.format(-Math.round(seconds / 60), "minute");
  if (seconds < 86400) return rtf.format(-Math.round(seconds / 3600), "hour");
  return rtf.format(-Math.round(seconds / 86400), "day");
}

function message(notification: Notification): string {
  const who = notification.actor?.name ?? "Someone";
  switch (notification.type) {
    case "task_assigned":
      return `${who} assigned you "${notification.preview}"`;
    case "task_updated":
      return `${who} updated "${notification.preview}"`;
    case "message":
      return `${who} sent a message: "${notification.preview}"`;
  }
}

// memo: a new notification re-renders the list, but not every existing row.
export const NotificationItem = memo(function NotificationItem({
  notification,
}: {
  notification: Notification;
}) {
  return (
    <li>
      {/* Links by ids — the project route accepts an ObjectId or a slug. */}
      <Link
        href={`/projects/${notification.project}?workspace=${notification.workspace}`}
        className={`flex flex-col gap-0.5 rounded-md px-3 py-2 hover:bg-black/5 dark:hover:bg-white/5 ${
          notification.read ? "" : "bg-black/[0.03] dark:bg-white/[0.06]"
        }`}
      >
        <span className="text-sm">{message(notification)}</span>
        <time
          dateTime={notification.createdAt}
          suppressHydrationWarning
          className="text-xs text-zinc-500 dark:text-zinc-400"
        >
          {relativeTime(notification.createdAt)}
        </time>
      </Link>
    </li>
  );
});

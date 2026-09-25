"use client";

import { memo } from "react";
import type { Message } from "@/types/api";

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

// memo: a new message re-renders the list, but not every existing bubble.
// Text is rendered as a React text node (escaped), never as HTML.
export const MessageBubble = memo(function MessageBubble({ message, isOwn }: { message: Message; isOwn: boolean }) {
  return (
    <li className={`flex flex-col gap-0.5 ${isOwn ? "items-end" : "items-start"}`}>
      <span className="text-xs text-zinc-500">
        {isOwn ? "You" : (message.sender?.name ?? "Deleted user")} ·{" "}
        <time dateTime={message.createdAt} suppressHydrationWarning>
          {timeFormat.format(new Date(message.createdAt))}
        </time>
      </span>
      <p
        className={`max-w-[80%] whitespace-pre-wrap break-words rounded-lg px-3 py-1.5 text-sm ${
          isOwn ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "bg-black/5 dark:bg-white/10"
        }`}
      >
        {message.text}
      </p>
    </li>
  );
});

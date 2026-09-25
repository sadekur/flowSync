"use client";

import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { apiFetch, ApiError } from "@/lib/client-api";
import { useAppDispatch, useAppSelector, useAppStore } from "@/store/hooks";
import {
  messagesHydrated,
  messagesReceived,
  olderMessagesLoaded,
  selectAllMessages,
  sendMessage,
} from "@/store/messagesSlice";
import { MessageBubble } from "./MessageBubble";
import type { Message, MessagePage } from "@/types/api";

const MAX_LENGTH = 2000;
// Caps the reconnect catch-up at 5 × 50 messages; anything beyond that is
// still reachable by reloading the page.
const MAX_CATCH_UP_PAGES = 5;

export function ChatPanel({
  workspaceId,
  projectId,
  currentUserId,
  initialMessages,
  initialHasOlder,
}: {
  workspaceId: string;
  // Canonical ObjectId — must match `message.project` on incoming events.
  projectId: string;
  currentUserId: string;
  initialMessages: Message[];
  initialHasOlder: boolean;
}) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const basePath = `/api/workspaces/${workspaceId}/projects/${projectId}/messages`;

  // Until the hydrate effect has run, render the server-fetched page directly
  // so the first paint isn't an empty chat.
  const storeReady = useAppSelector((s) => s.messages.projectId === projectId);
  const storeMessages = useAppSelector(selectAllMessages);
  const storeHasOlder = useAppSelector((s) => s.messages.hasOlder);
  const messages = storeReady ? storeMessages : initialMessages;
  const hasOlder = storeReady ? storeHasOlder : initialHasOlder;

  const connected = useAppSelector((s) => s.socket.status === "connected");
  const inRoom = useAppSelector((s) => s.socket.joinedProjectId === projectId);

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);

  useEffect(() => {
    dispatch(messagesHydrated({ projectId, messages: initialMessages, hasOlder: initialHasOlder }));
  }, [dispatch, projectId, initialMessages, initialHasOlder]);

  // Every (re)join of the room — including the first — fetches whatever was
  // posted while this tab wasn't in it: between the server render and the
  // first join, or during a disconnect. Live events only cover the time in
  // the room.
  useEffect(() => {
    if (!inRoom) return;
    let cancelled = false;

    async function catchUp(): Promise<void> {
      for (let page = 0; page < MAX_CATCH_UP_PAGES; page++) {
        const state = store.getState().messages;
        if (cancelled || state.projectId !== projectId) return;

        const newestId = state.ids.at(-1);
        if (!newestId) {
          // Empty chat so far: the latest page is everything we're missing.
          const res = await apiFetch<MessagePage>(`${basePath}?limit=50`);
          if (!cancelled) dispatch(olderMessagesLoaded({ projectId, messages: res.messages, hasOlder: res.hasMore }));
          return;
        }

        const res = await apiFetch<MessagePage>(`${basePath}?after=${newestId}&limit=50`);
        if (cancelled) return;
        dispatch(messagesReceived({ projectId, messages: res.messages }));
        if (!res.hasMore) return;
      }
    }

    // Best effort — a failed catch-up just leaves a gap until the next reload.
    catchUp().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [inRoom, projectId, basePath, dispatch, store]);

  // Stick to the bottom when a new message arrives, unless the user has
  // scrolled up to read history. Always follow your own messages.
  const listRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const lastMessage = messages.at(-1);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el || !lastMessage) return;
    if (nearBottomRef.current || lastMessage.sender?._id === currentUserId) {
      el.scrollTop = el.scrollHeight;
    }
  }, [lastMessage, currentUserId]);

  function handleScroll(): void {
    const el = listRef.current;
    if (el) nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  async function loadOlder(): Promise<void> {
    const oldestId = messages[0]?._id;
    if (!oldestId) return;
    setLoadingOlder(true);
    try {
      const res = await apiFetch<MessagePage>(`${basePath}?before=${oldestId}`);
      dispatch(olderMessagesLoaded({ projectId, messages: res.messages, hasOlder: res.hasMore }));
    } catch (err) {
      setSendError(err instanceof ApiError ? err.message : "Couldn't load older messages");
    } finally {
      setLoadingOlder(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;

    setSendError(null);
    setSending(true);
    const result = await dispatch(sendMessage({ projectId, text: trimmed }));
    setSending(false);

    if (result.ok) {
      setText("");
    } else {
      // Keep the draft so nothing typed is lost.
      setSendError(result.error);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Chat</h2>

      <div
        ref={listRef}
        onScroll={handleScroll}
        className="h-80 overflow-y-auto rounded-lg border border-black/10 px-4 py-3 dark:border-white/10"
      >
        {hasOlder && (
          <div className="mb-3 flex justify-center">
            <button
              type="button"
              onClick={loadOlder}
              disabled={loadingOlder}
              className="text-xs text-zinc-600 underline disabled:opacity-50 dark:text-zinc-400"
            >
              {loadingOlder ? "Loading…" : "Load older messages"}
            </button>
          </div>
        )}
        <ul className="flex flex-col gap-3">
          {messages.map((message) => (
            <MessageBubble key={message._id} message={message} isOwn={message.sender?._id === currentUserId} />
          ))}
        </ul>
        {messages.length === 0 && <p className="text-sm text-zinc-500">No messages yet. Say hello!</p>}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-wrap items-start gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={connected ? "Write a message…" : "Connecting…"}
          maxLength={MAX_LENGTH}
          aria-label="Message"
          className="flex-1 rounded-md border border-black/15 px-3 py-1.5 text-sm dark:border-white/15 dark:bg-transparent"
        />
        <button
          type="submit"
          disabled={sending || !connected || text.trim().length === 0}
          className="rounded-md border border-black/15 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-white/15"
        >
          Send
        </button>
        {sendError && <p className="w-full text-sm text-red-600 dark:text-red-400">{sendError}</p>}
      </form>
    </section>
  );
}

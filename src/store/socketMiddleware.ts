import type { Middleware } from "@reduxjs/toolkit";
import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@/types/socket";
import {
  connectFailed,
  connected,
  disconnected,
  joinProject,
  leaveProject,
  roomJoinFailed,
  roomJoined,
  socketConnect,
  socketDisconnect,
} from "./socketSlice";
import { messagesReceived, sendMessage } from "./messagesSlice";
import {
  typingStart,
  typingStop,
  typingStarted,
  typingStopped,
  userOnline,
  userOffline,
} from "./presenceSlice";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL as string;
const SEND_TIMEOUT_MS = 10_000;
// Client-side typing throttle: at most one `typing:start` per interval per
// project, and a `typing:stop` this long after the last keystroke. The
// server rate-limits too; this just keeps the socket quiet between keys.
const TYPING_SEND_INTERVAL_MS = 2_500;
const TYPING_STOP_AFTER_MS = 3_000;
// How long a peer's "is typing" label survives without a fresh
// `typing:start` — longer than TYPING_SEND_INTERVAL_MS so the sender's
// periodic re-sends keep it alive, and it self-clears if their tab dies
// mid-typing without sending `typing:stop`.
const TYPING_EXPIRY_MS = 3_500;

type FlowSyncSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export type SendMessageResult = { ok: true } | { ok: false; error: string };

// Typed dispatch extension: `dispatch(sendMessage(...))` returns the ack
// result instead of the action. configureStore folds this into AppDispatch.
export interface SocketDispatchExt {
  (action: ReturnType<typeof sendMessage>): Promise<SendMessageResult>;
}

/**
 * The only code that touches the Socket.IO client. A factory (one socket per
 * store, like makeStore itself) — and the socket is only ever created in
 * response to socketConnect, which is only dispatched from client effects, so
 * nothing here runs during server rendering.
 */
export function createSocketMiddleware(): Middleware<SocketDispatchExt> {
  let socket: FlowSyncSocket | null = null;
  // The room the UI wants to be in, independent of connection state — so it
  // can be re-joined automatically after every reconnect.
  let activeProjectId: string | null = null;
  // Outgoing typing throttle state, keyed by projectId.
  const lastTypingSentAt = new Map<string, number>();
  const typingStopTimers = new Map<string, ReturnType<typeof setTimeout>>();
  // Incoming "is typing" expiry, keyed by `${projectId}:${userId}`.
  const typingExpiryTimers = new Map<string, ReturnType<typeof setTimeout>>();

  return (store) => {
    function clearTypingState(): void {
      for (const timer of typingStopTimers.values()) clearTimeout(timer);
      for (const timer of typingExpiryTimers.values()) clearTimeout(timer);
      typingStopTimers.clear();
      typingExpiryTimers.clear();
      lastTypingSentAt.clear();
    }

    function emitTypingStop(projectId: string): void {
      const timer = typingStopTimers.get(projectId);
      if (timer) {
        clearTimeout(timer);
        typingStopTimers.delete(projectId);
      }
      // A stop only matters if a start was sent (the throttle map records
      // that); clearing the throttle lets the next keystroke start again.
      if (lastTypingSentAt.has(projectId) && socket?.connected && activeProjectId === projectId) {
        socket.emit("typing:stop", { projectId }, () => {});
      }
      lastTypingSentAt.delete(projectId);
    }

    function handleTypingStart(projectId: string): void {
      if (socket?.connected && activeProjectId === projectId) {
        const now = Date.now();
        const last = lastTypingSentAt.get(projectId) ?? 0;
        if (now - last >= TYPING_SEND_INTERVAL_MS) {
          lastTypingSentAt.set(projectId, now);
          socket.emit("typing:start", { projectId }, () => {});
        }
      }
      // (Re)arm the auto-stop: peers clear "X is typing" once keystrokes stop.
      const existing = typingStopTimers.get(projectId);
      if (existing) clearTimeout(existing);
      typingStopTimers.set(projectId, setTimeout(() => emitTypingStop(projectId), TYPING_STOP_AFTER_MS));
    }

    function scheduleTypingExpiry(projectId: string, userId: string): void {
      const key = `${projectId}:${userId}`;
      const existing = typingExpiryTimers.get(key);
      if (existing) clearTimeout(existing);
      typingExpiryTimers.set(
        key,
        setTimeout(() => {
          typingExpiryTimers.delete(key);
          store.dispatch(typingStopped({ projectId, userId }));
        }, TYPING_EXPIRY_MS),
      );
    }

    function emitJoin(projectId: string): void {
      socket?.emit("project:join", { projectId }, (res) => {
        if (activeProjectId !== projectId) {
          // The page moved on before this ack arrived; don't linger in the room.
          socket?.emit("project:leave", { projectId }, () => {});
          return;
        }
        store.dispatch(
          res.ok ? roomJoined({ projectId, onlineUserIds: res.onlineUserIds }) : roomJoinFailed(res.error),
        );
      });
    }

    function getSocket(): FlowSyncSocket {
      if (socket) return socket;

      // withCredentials sends the httpOnly auth cookies with the handshake —
      // that's how the server authenticates this connection.
      socket = io(SOCKET_URL, { withCredentials: true, autoConnect: false });

      socket.on("connect", () => {
        store.dispatch(connected());
        if (activeProjectId) emitJoin(activeProjectId);
      });
      socket.on("disconnect", () => {
        store.dispatch(disconnected({ willReconnect: socket?.active ?? false }));
      });
      // An auth rejection leaves `active` false (no auto-retry); a network
      // failure leaves it true and the client keeps retrying on its own.
      socket.on("connect_error", (err) => {
        store.dispatch(connectFailed({ message: err.message, willRetry: socket?.active ?? false }));
      });
      socket.on("message:new", (message) => {
        store.dispatch(messagesReceived({ projectId: message.project, messages: [message] }));
      });
      socket.on("user:online", (payload) => {
        store.dispatch(userOnline(payload));
      });
      socket.on("user:offline", (payload) => {
        store.dispatch(userOffline(payload));
      });
      socket.on("typing:start", (payload) => {
        store.dispatch(typingStarted(payload));
        scheduleTypingExpiry(payload.projectId, payload.userId);
      });
      socket.on("typing:stop", (payload) => {
        const key = `${payload.projectId}:${payload.userId}`;
        const timer = typingExpiryTimers.get(key);
        if (timer) {
          clearTimeout(timer);
          typingExpiryTimers.delete(key);
        }
        store.dispatch(typingStopped(payload));
      });

      return socket;
    }

    function emitSend(payload: { projectId: string; text: string }): Promise<SendMessageResult> {
      return new Promise((resolve) => {
        if (!socket?.connected) {
          resolve({ ok: false, error: "Not connected — try again in a moment" });
          return;
        }
        socket.timeout(SEND_TIMEOUT_MS).emit("message:send", payload, (err, res) => {
          if (err) {
            resolve({ ok: false, error: "The server didn't respond — try again" });
          } else if (res.ok) {
            // Show it straight away; the matching message:new broadcast is
            // deduped by _id.
            store.dispatch(messagesReceived({ projectId: res.message.project, messages: [res.message] }));
            resolve({ ok: true });
          } else {
            resolve({ ok: false, error: res.error });
          }
        });
      });
    }

    return (next) => (action) => {
      const result = next(action);

      if (socketConnect.match(action)) {
        const s = getSocket();
        if (!s.active) s.connect();
      } else if (socketDisconnect.match(action)) {
        activeProjectId = null;
        clearTypingState();
        socket?.disconnect();
      } else if (joinProject.match(action)) {
        activeProjectId = action.payload;
        if (socket?.connected) emitJoin(action.payload);
      } else if (leaveProject.match(action)) {
        // Tell peers "stopped typing" before the page (and activeProjectId)
        // moves on; after that the server-side presence cleanup runs.
        emitTypingStop(action.payload);
        if (activeProjectId === action.payload) activeProjectId = null;
        if (socket?.connected) socket.emit("project:leave", { projectId: action.payload }, () => {});
      } else if (sendMessage.match(action)) {
        return emitSend(action.payload);
      } else if (typingStart.match(action)) {
        handleTypingStart(action.payload.projectId);
      } else if (typingStop.match(action)) {
        emitTypingStop(action.payload.projectId);
      }

      return result;
    };
  };
}

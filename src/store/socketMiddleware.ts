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

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL as string;
const SEND_TIMEOUT_MS = 10_000;

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

  return (store) => {
    function emitJoin(projectId: string): void {
      socket?.emit("project:join", { projectId }, (res) => {
        if (activeProjectId !== projectId) {
          // The page moved on before this ack arrived; don't linger in the room.
          socket?.emit("project:leave", { projectId }, () => {});
          return;
        }
        store.dispatch(res.ok ? roomJoined(projectId) : roomJoinFailed(res.error));
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
        socket?.disconnect();
      } else if (joinProject.match(action)) {
        activeProjectId = action.payload;
        if (socket?.connected) emitJoin(action.payload);
      } else if (leaveProject.match(action)) {
        if (activeProjectId === action.payload) activeProjectId = null;
        if (socket?.connected) socket.emit("project:leave", { projectId: action.payload }, () => {});
      }

      return result;
    };
  };
}

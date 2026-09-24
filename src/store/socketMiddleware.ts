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

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL as string;

type FlowSyncSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * The only code that touches the Socket.IO client. A factory (one socket per
 * store, like makeStore itself) — and the socket is only ever created in
 * response to socketConnect, which is only dispatched from client effects, so
 * nothing here runs during server rendering.
 */
export function createSocketMiddleware(): Middleware {
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

      return socket;
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

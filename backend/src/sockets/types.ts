import type { Server, Socket } from "socket.io";
import type { MessageDto } from "../services/message.service";
import type { TaskDocument } from "../models/Task";
import type { NotificationDto } from "../services/notification.service";

// Mirrored by hand in src/types/socket.ts — the frontend can't import from
// backend/ (separate tsconfig scope), so keep both in sync when adding events.

// `T` is extra data carried by a successful ack (e.g. the saved message).
export type AckResponse<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };
export type Ack<T extends object = object> = (res: AckResponse<T>) => void;

export interface ClientToServerEvents {
  "project:join": (payload: { projectId: string }, ack: Ack<{ onlineUserIds: string[] }>) => void;
  "project:leave": (payload: { projectId: string }, ack: Ack) => void;
  "message:send": (payload: { projectId: string; text: string }, ack: Ack<{ message: MessageDto }>) => void;
  // Ephemeral by design — throttled client-side, rate-limited server-side,
  // never persisted. The ack only confirms validation.
  "typing:start": (payload: { projectId: string }, ack: Ack) => void;
  "typing:stop": (payload: { projectId: string }, ack: Ack) => void;
}

export interface ServerToClientEvents {
  "message:new": (message: MessageDto) => void;
  // Emitted by the REST task layer (via sockets/emitter.ts), not by a handler:
  // task writes stay REST (membership + CSRF already enforced), only the
  // delivery is real-time.
  "task:created": (task: TaskDocument) => void;
  "task:updated": (task: TaskDocument) => void;
  "task:deleted": (payload: { projectId: string; taskId: string }) => void;
  // Delivered to the recipient's own `user:{id}` room, so it reaches them even
  // when they aren't viewing the project (see sockets/index.ts).
  "notification:new": (notification: NotificationDto) => void;
  "user:online": (payload: { projectId: string; userId: string }) => void;
  "user:offline": (payload: { projectId: string; userId: string }) => void;
  "typing:start": (payload: { projectId: string; userId: string }) => void;
  "typing:stop": (payload: { projectId: string; userId: string }) => void;
}

// For io.serverSideEmit between backend instances. The Redis adapter (Step 11)
// doesn't need any: room broadcasts are relayed without declaring events here.
export interface InterServerEvents {}

export interface SocketData {
  userId: string;
}

export type IoServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
export type IoSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

export function projectRoom(projectId: string): string {
  return `project:${projectId}`;
}

// A user's own room, joined at connection — the delivery target for anything
// addressed to a person rather than a project (notifications), so it reaches
// them whether or not they're viewing the project it refers to.
export function userRoom(userId: string): string {
  return `user:${userId}`;
}

// A client can emit without an ack callback; never let that throw.
export function safeAck<T extends object = object>(ack: unknown): Ack<T> {
  return typeof ack === "function" ? (ack as Ack<T>) : () => {};
}

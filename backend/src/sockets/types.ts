import type { Server, Socket } from "socket.io";
import type { MessageDto } from "../services/message.service";

// Mirrored by hand in src/types/socket.ts — the frontend can't import from
// backend/ (separate tsconfig scope), so keep both in sync when adding events.

// `T` is extra data carried by a successful ack (e.g. the saved message).
export type AckResponse<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };
export type Ack<T extends object = object> = (res: AckResponse<T>) => void;

export interface ClientToServerEvents {
  "project:join": (payload: { projectId: string }, ack: Ack) => void;
  "project:leave": (payload: { projectId: string }, ack: Ack) => void;
  "message:send": (payload: { projectId: string; text: string }, ack: Ack<{ message: MessageDto }>) => void;
}

export interface ServerToClientEvents {
  "message:new": (message: MessageDto) => void;
}

// Only needed once the Redis adapter lands (Step 11).
export interface InterServerEvents {}

export interface SocketData {
  userId: string;
}

export type IoServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
export type IoSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

export function projectRoom(projectId: string): string {
  return `project:${projectId}`;
}

// A client can emit without an ack callback; never let that throw.
export function safeAck<T extends object = object>(ack: unknown): Ack<T> {
  return typeof ack === "function" ? (ack as Ack<T>) : () => {};
}

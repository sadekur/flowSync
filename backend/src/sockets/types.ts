import type { Server, Socket } from "socket.io";

// Mirrored by hand in src/types/socket.ts — the frontend can't import from
// backend/ (separate tsconfig scope), so keep both in sync when adding events.

export type Ack = (res: { ok: true } | { ok: false; error: string }) => void;

export interface ClientToServerEvents {
  "project:join": (payload: { projectId: string }, ack: Ack) => void;
  "project:leave": (payload: { projectId: string }, ack: Ack) => void;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- server-pushed events arrive from Step 7 onward
export interface ServerToClientEvents {}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- only needed once the Redis adapter lands (Step 11)
export interface InterServerEvents {}

export interface SocketData {
  userId: string;
}

export type IoServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
export type IoSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

export function projectRoom(projectId: string): string {
  return `project:${projectId}`;
}

// Hand-mirrored from backend/src/sockets/types.ts — keep both in sync.
import type { Message } from "./api";

// `T` is extra data carried by a successful ack (e.g. the saved message).
export type AckResponse<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };
export type Ack<T extends object = object> = (res: AckResponse<T>) => void;

export interface ClientToServerEvents {
  "project:join": (payload: { projectId: string }, ack: Ack) => void;
  "project:leave": (payload: { projectId: string }, ack: Ack) => void;
  "message:send": (payload: { projectId: string; text: string }, ack: Ack<{ message: Message }>) => void;
}

export interface ServerToClientEvents {
  "message:new": (message: Message) => void;
}

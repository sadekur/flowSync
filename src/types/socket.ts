// Hand-mirrored from backend/src/sockets/types.ts — keep both in sync.

export type Ack = (res: { ok: true } | { ok: false; error: string }) => void;

export interface ClientToServerEvents {
  "project:join": (payload: { projectId: string }, ack: Ack) => void;
  "project:leave": (payload: { projectId: string }, ack: Ack) => void;
}

// Server-pushed events arrive from Step 7 onward.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ServerToClientEvents {}

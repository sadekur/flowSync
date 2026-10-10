import { redis } from "../config/redis";
import { logger } from "../utils/logger";
import { projectRoom, type IoSocket } from "./types";

// Presence lives only in Redis, never Mongo (DECISIONS.md): one hash per
// project, field = userId, value = the number of that user's sockets in the
// room. The count makes multiple tabs behave: the first socket broadcasts
// `user:online`, and `user:offline` fires only when the last socket leaves,
// so a second tab never makes the user look doubly-online or half-offline.
const ROOM_PREFIX = "project:";
const PRESENCE_PREFIX = "presence:project:";
// Keys only exist while someone has the project open, so this is purely a
// crash guard — a server that dies mid-session can't leave keys forever.
// Refreshed on every change.
const PRESENCE_TTL_SECONDS = 24 * 60 * 60;

function presenceKey(projectId: string): string {
  return `${PRESENCE_PREFIX}${projectId}`;
}

/**
 * Registers one of the user's sockets in the project room's presence hash
 * and returns the full snapshot of online user ids, for the join ack.
 */
export async function addPresence(socket: IoSocket, projectId: string): Promise<string[]> {
  const key = presenceKey(projectId);
  const { userId } = socket.data;

  const results = await redis.multi().hincrby(key, userId, 1).expire(key, PRESENCE_TTL_SECONDS).exec();
  const [incrErr, count] = results?.[0] ?? [new Error("Presence transaction aborted"), 0];
  if (incrErr) throw incrErr;

  // 0 → 1 means this is the user's first socket in the room — everyone else
  // in the room is told. Extra sockets only bump the count.
  if (count === 1) {
    socket.nsp.to(projectRoom(projectId)).emit("user:online", { projectId, userId });
  }

  return redis.hkeys(key);
}

/**
 * Unregisters one socket (project:leave or disconnect) and broadcasts
 * `user:offline` only when the user's last socket left the room.
 *
 * `wasPresent` is read before the decrement because HINCRBY alone can't tell
 * a 1 → 0 (broadcast) apart from "never here" (HINCRBY would return -1). The
 * read-then-write race is benign: concurrent sockets compute the same count,
 * so at worst `user:offline` is broadcast twice, which the client treats
 * idempotently.
 */
export async function removePresence(socket: IoSocket, projectId: string): Promise<void> {
  const key = presenceKey(projectId);
  const { userId } = socket.data;

  const wasPresent = (await redis.hget(key, userId)) !== null;
  const remaining = await redis.hincrby(key, userId, -1);
  if (remaining <= 0) {
    await redis.hdel(key, userId);
  }

  if (wasPresent && remaining <= 0) {
    socket.nsp.to(projectRoom(projectId)).emit("user:offline", { projectId, userId });
  }
}

/**
 * Disconnect cleanup: the socket implicitly leaves every project room it was
 * in (socket.rooms still lists them during `disconnect`), so remove its
 * presence from each. Best effort — failures are logged, and any missed key
 * expires with the TTL.
 */
export async function removePresenceFromAllRooms(socket: IoSocket): Promise<void> {
  for (const room of socket.rooms) {
    if (!room.startsWith(ROOM_PREFIX)) continue;
    const projectId = room.slice(ROOM_PREFIX.length);
    try {
      await removePresence(socket, projectId);
    } catch (err) {
      logger.error(`presence cleanup failed for room ${room}`, err);
    }
  }
}

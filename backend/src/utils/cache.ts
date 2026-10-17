import { redis } from "../config/redis";
import { logger } from "./logger";

// Every cache key lives under `cache:` so it can never collide with the
// presence (`presence:`) or rate-limit (`ratelimit:`) keys sharing this Redis.
export const cacheKeys = {
  // string[] of member user ids — read by every socket membership check.
  workspaceMembers: (workspaceId: string) => `cache:workspace:${workspaceId}:members`,
  // The project's workspace id. A project never moves workspace, so this only
  // changes when the project is deleted.
  projectWorkspace: (projectId: string) => `cache:project:${projectId}:workspace`,
  // GET /api/workspaces for one user — the dashboard's first read.
  userWorkspaces: (userId: string) => `cache:user:${userId}:workspaces`,
};

/**
 * Cache-aside read: Redis first, else `load()` from Mongo and store the
 * result for `ttlSeconds`. Values go through JSON, so `load` must return
 * plain data (ids/dates as strings), never a Mongoose document.
 *
 * Mongo stays the source of truth: a Redis failure is logged and falls
 * through to `load`, and `null` (not found) is never cached, so a document
 * created a moment later isn't hidden behind a cached miss.
 */
export async function cacheAside<T>(key: string, ttlSeconds: number, load: () => Promise<T | null>): Promise<T | null> {
  try {
    const hit = await redis.get(key);
    if (hit !== null) return JSON.parse(hit) as T;
  } catch (err) {
    logger.error(`cache read failed for ${key}`, err);
  }

  const value = await load();
  if (value === null) return null;

  try {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch (err) {
    logger.error(`cache write failed for ${key}`, err);
  }
  return value;
}

/**
 * Drops keys after the Mongo write that made them stale. Called *after* the
 * write, so the next read reloads the new state. A failed delete is logged,
 * not thrown — the write already succeeded, and the TTL bounds how long the
 * stale value can live.
 */
export async function invalidateCache(...keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  try {
    await redis.del(...keys);
  } catch (err) {
    logger.error(`cache invalidation failed for ${keys.join(", ")}`, err);
  }
}

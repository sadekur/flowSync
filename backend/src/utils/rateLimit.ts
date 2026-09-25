import { redis } from "../config/redis";

/**
 * Fixed-window counter in Redis: returns true once `key` has been hit more
 * than `limit` times within `windowSeconds`. Stored in Redis (not process
 * memory) so the limit still holds once there are several backend instances.
 * INCR + EXPIRE NX run in one MULTI, so a key can never be left without a TTL.
 */
export async function isRateLimited(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const results = await redis.multi().incr(key).expire(key, windowSeconds, "NX").exec();
  const [incrErr, count] = results?.[0] ?? [new Error("Rate limit transaction aborted"), 0];
  if (incrErr) throw incrErr;
  return (count as number) > limit;
}

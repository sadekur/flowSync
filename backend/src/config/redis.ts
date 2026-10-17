import Redis from "ioredis";
import { env } from "./env";
import { logger } from "../utils/logger";

export const redis = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 3,
});

redis.on("connect", () => logger.info("Redis connected"));
redis.on("error", (err) => logger.error("Redis connection error", err));

// The Socket.IO Redis adapter (Step 11) gets its own pair of connections: a
// connection in subscriber mode can't run normal commands, and keeping
// publishing off `redis` stops adapter traffic from queueing behind (or
// ahead of) presence, rate-limit and cache commands. duplicate() copies the
// options, lazyConnect included, but not the listeners.
export const pubClient = redis.duplicate();
export const subClient = redis.duplicate();

pubClient.on("error", (err) => logger.error("Redis adapter pub connection error", err));
subClient.on("error", (err) => logger.error("Redis adapter sub connection error", err));

export async function connectRedis(): Promise<void> {
  await Promise.all([redis.connect(), pubClient.connect(), subClient.connect()]);
}

export function disconnectRedis(): void {
  redis.disconnect();
  pubClient.disconnect();
  subClient.disconnect();
}

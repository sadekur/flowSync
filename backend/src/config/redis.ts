import Redis from "ioredis";
import { env } from "./env";
import { logger } from "../utils/logger";

export const redis = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 3,
});

redis.on("connect", () => logger.info("Redis connected"));
redis.on("error", (err) => logger.error("Redis connection error", err));

export async function connectRedis(): Promise<void> {
  await redis.connect();
}

export function disconnectRedis(): void {
  redis.disconnect();
}

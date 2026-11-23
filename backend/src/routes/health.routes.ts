import { Router } from "express";
import mongoose from "mongoose";
import { redis } from "../config/redis";
import { asyncHandler } from "../utils/asyncHandler";

export const healthRouter = Router();

const MONGO_WAIT_MS = 5_000;

healthRouter.get(
  "/health",
  asyncHandler(async (_req, res) => {
    // Like the Redis ping below, wait (briefly) for a connection that is still
    // opening instead of reporting the instant's state. On Vercel the connect
    // started at module load only makes progress while a request is in flight,
    // so a snapshot reads "disconnected" for the first several requests even
    // though queries (which Mongoose buffers) would succeed.
    if (mongoose.connection.readyState === mongoose.ConnectionStates.connecting) {
      await Promise.race([
        mongoose.connection.asPromise().catch(() => undefined),
        new Promise((resolve) => setTimeout(resolve, MONGO_WAIT_MS)),
      ]);
    }
    const mongoConnected = mongoose.connection.readyState === mongoose.ConnectionStates.connected;

    let redisConnected = false;
    try {
      redisConnected = (await redis.ping()) === "PONG";
    } catch {
      redisConnected = false;
    }

    const healthy = mongoConnected && redisConnected;

    res.status(healthy ? 200 : 503).json({
      status: healthy ? "ok" : "degraded",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      mongo: mongoConnected ? "connected" : "disconnected",
      redis: redisConnected ? "connected" : "disconnected",
    });
  }),
);

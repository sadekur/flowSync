import { Router } from "express";
import mongoose from "mongoose";
import { redis } from "../config/redis";
import { asyncHandler } from "../utils/asyncHandler";

export const healthRouter = Router();

healthRouter.get(
  "/health",
  asyncHandler(async (_req, res) => {
    const mongoConnected = mongoose.connection.readyState === 1;

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

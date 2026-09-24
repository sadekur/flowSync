import type http from "node:http";
import { Server } from "socket.io";
import cookieParser from "cookie-parser";
import { env } from "../config/env";
import { logger } from "../utils/logger";
import { socketAuth } from "./auth";
import { registerProjectHandlers } from "./handlers/project.handlers";
import type { IoServer } from "./types";

export function createSocketServer(httpServer: http.Server): IoServer {
  const io: IoServer = new Server(httpServer, {
    // Only governs the HTTP long-polling transport — browsers don't apply
    // CORS to WebSocket upgrades, hence the explicit Origin check below.
    cors: { origin: env.CORS_ORIGIN, credentials: true },
    // Cross-site WebSocket hijacking guard: reject any handshake (polling or
    // upgrade) whose Origin isn't exactly the frontend's, before auth runs.
    allowRequest: (req, callback) => {
      callback(null, req.headers.origin === env.CORS_ORIGIN);
    },
  });

  // Populates socket.request.cookies for socketAuth — same parser as the REST app.
  io.engine.use(cookieParser());
  io.use(socketAuth);

  io.on("connection", (socket) => {
    logger.info(`socket connected: ${socket.id} (user ${socket.data.userId})`);

    registerProjectHandlers(socket);

    socket.on("disconnect", (reason) => {
      logger.info(`socket disconnected: ${socket.id} (user ${socket.data.userId}) — ${reason}`);
    });
  });

  return io;
}

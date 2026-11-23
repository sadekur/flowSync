import type http from "node:http";
import { Server } from "socket.io";
import cookieParser from "cookie-parser";
import { createAdapter } from "@socket.io/redis-adapter";
import { env } from "../config/env";
import { pubClient, subClient } from "../config/redis";
import { logger } from "../utils/logger";
import { socketAuth } from "./auth";
import { registerProjectHandlers } from "./handlers/project.handlers";
import { registerMessageHandlers } from "./handlers/message.handlers";
import { registerTypingHandlers } from "./handlers/typing.handlers";
import { removePresenceFromAllRooms } from "./presence";
import { userRoom, type IoServer } from "./types";

/**
 * The frontend's Origin is either CORS_ORIGIN (dev: Next on :3000, API on
 * :4000) or the API's own origin (same-origin deploys: Vercel services and
 * Docker+Nginx serve both from one host, and every Vercel preview has its own
 * host, so no fixed value could list them).
 *
 * Same-origin is judged against the host the request was sent to. A browser
 * can't forge either side of that comparison on a WebSocket handshake — it
 * sets Origin and Host itself, and page JS can't add headers to the upgrade —
 * so a page on another site always fails it. `x-forwarded-host` is the public
 * host when a proxy (Vercel, Nginx) sits in front.
 */
export function isAllowedOrigin(origin: string | undefined, headers: http.IncomingHttpHeaders): boolean {
  if (!origin) return false;
  if (origin === env.CORS_ORIGIN) return true;

  const forwarded = headers["x-forwarded-host"];
  const host = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim() || headers.host;
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function createSocketServer(httpServer: http.Server): IoServer {
  const io: IoServer = new Server(httpServer, {
    // Only governs the HTTP long-polling transport — browsers don't apply
    // CORS to WebSocket upgrades, hence the explicit Origin check below.
    cors: { origin: env.CORS_ORIGIN ?? false, credentials: true },
    // Cross-site WebSocket hijacking guard: reject any handshake (polling or
    // upgrade) whose Origin isn't the frontend's, before auth runs.
    allowRequest: (req, callback) => {
      callback(null, isAllowedOrigin(req.headers.origin, req.headers));
    },
    // Largest legit packet is one chat message (≤2000 chars, ≤8KB as UTF-8);
    // the 1MB default would let a client make the server buffer far more.
    maxHttpBufferSize: 64 * 1024,
    // Rooms are local to each process. The Redis adapter relays every
    // broadcast (room emits, io.to() from the REST layer) over pub/sub, so it
    // reaches sockets connected to any backend instance, not just this one.
    adapter: createAdapter(pubClient, subClient),
  });

  // Populates socket.request.cookies for socketAuth — same parser as the REST app.
  io.engine.use(cookieParser());
  io.use(socketAuth);

  io.on("connection", (socket) => {
    logger.info(`socket connected: ${socket.id} (user ${socket.data.userId})`);

    // Join the user's own room so notifications reach them regardless of which
    // project (if any) they're viewing.
    socket.join(userRoom(socket.data.userId));

    registerProjectHandlers(socket);
    registerMessageHandlers(socket);
    registerTypingHandlers(socket);

    // Presence cleanup must run on "disconnecting", not "disconnect":
    // socket.io leaves every room (join([])) before emitting "disconnect",
    // so by then socket.rooms no longer lists the project rooms. Best
    // effort — a missed decrement expires with the presence TTL.
    socket.on("disconnecting", (reason) => {
      removePresenceFromAllRooms(socket).catch((err) =>
        logger.error(`presence cleanup failed on disconnect (user ${socket.data.userId})`, err),
      );
    });

    socket.on("disconnect", (reason) => {
      logger.info(`socket disconnected: ${socket.id} (user ${socket.data.userId}) — ${reason}`);
    });
  });

  return io;
}

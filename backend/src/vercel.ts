import { connectDB, disconnectDB } from "./config/db";
import { connectRedis, disconnectRedis } from "./config/redis";
import { logger } from "./utils/logger";
import { setIo } from "./sockets/emitter";
import { createHttpServer } from "./httpServer";

// Vercel Functions entry (the `api` service in vercel.json). Vercel does the
// listening, so this exports the http.Server — the form its WebSocket support
// needs — instead of calling listen() like server.ts.
//
// One instance serves many requests and sockets (Fluid Compute), so the
// connections are opened once per instance, at module load. Requests that
// arrive first don't fail: Mongoose buffers queries until it's connected, and
// ioredis queues commands (adapter subscriptions included) the same way.
const { httpServer, io } = createHttpServer();

Promise.all([connectRedis(), connectDB()]).catch((err) => {
  logger.error("Startup connection failed", err);
});

// Scale-down: close sockets (clients reconnect to another instance and
// re-join, see socketMiddleware) and the store connections.
process.on("SIGTERM", () => {
  void (async () => {
    await io.close();
    setIo(null);
    await disconnectDB();
    disconnectRedis();
  })();
});

export default httpServer;

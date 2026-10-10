import http from "node:http";
import { env } from "./config/env";
import { createApp } from "./app";
import { connectDB, disconnectDB } from "./config/db";
import { connectRedis, disconnectRedis } from "./config/redis";
import { logger } from "./utils/logger";
import { createSocketServer } from "./sockets";
import { setIo } from "./sockets/emitter";

async function main(): Promise<void> {
  await connectRedis();
  await connectDB();

  const app = createApp();
  // http.createServer wraps the app (rather than app.listen directly) so
  // Socket.IO shares the same server/port as the REST API.
  const httpServer = http.createServer(app);
  const io = createSocketServer(httpServer);
  // Publishes `io` to the REST layer (task controllers broadcast through it).
  setIo(io);

  httpServer.listen(env.PORT, () => {
    logger.info(`Backend listening on port ${env.PORT}`);
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}, shutting down`);
    // io.close() also closes httpServer and disconnects every open socket,
    // which httpServer.close() alone would wait on forever.
    await io.close();
    setIo(null);
    await disconnectDB();
    disconnectRedis();
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  logger.error("Fatal startup error", err);
  process.exit(1);
});

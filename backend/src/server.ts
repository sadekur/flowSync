import http from "node:http";
import { env } from "./config/env";
import { createApp } from "./app";
import { connectDB, disconnectDB } from "./config/db";
import { connectRedis, disconnectRedis } from "./config/redis";
import { logger } from "./utils/logger";

async function main(): Promise<void> {
  await connectRedis();
  await connectDB();

  const app = createApp();
  // http.createServer wraps the app (rather than app.listen directly) so
  // Socket.IO can attach to the same server later without refactoring this.
  const httpServer = http.createServer(app);

  httpServer.listen(env.PORT, () => {
    logger.info(`Backend listening on port ${env.PORT}`);
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}, shutting down`);
    httpServer.close();
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

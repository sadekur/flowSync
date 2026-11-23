import { env } from "./config/env";
import { connectDB, disconnectDB } from "./config/db";
import { connectRedis, disconnectRedis } from "./config/redis";
import { logger } from "./utils/logger";
import { setIo } from "./sockets/emitter";
import { createHttpServer } from "./httpServer";

// Long-running entry: `npm run dev:backend`, `npm run start:backend`, Docker.
// On Vercel the entry is vercel.ts instead (Vercel owns the listening).
async function main(): Promise<void> {
  await connectRedis();
  await connectDB();

  const { httpServer, io } = createHttpServer();

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

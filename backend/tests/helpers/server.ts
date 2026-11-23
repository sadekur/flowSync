import type { AddressInfo } from "node:net";
import mongoose from "mongoose";
import { connectDB, disconnectDB } from "../../src/config/db";
import { connectRedis, disconnectRedis, redis } from "../../src/config/redis";
import { setIo } from "../../src/sockets/emitter";
import { createHttpServer } from "../../src/httpServer";
import type { IoServer } from "../../src/sockets/types";

export interface TestServer {
  url: string;
  io: IoServer;
  close: () => Promise<void>;
}

/**
 * The exact wiring server.ts and vercel.ts use (createHttpServer: REST app +
 * Socket.IO with the Redis adapter on one HTTP server, `io` registered for the
 * REST layer's broadcasts), on a random port, against the test database set up
 * in setup/env.ts.
 */
export async function startTestServer(): Promise<TestServer> {
  await connectRedis();
  await connectDB();
  // A fresh database per file. Indexes are rebuilt straight away because the
  // unique ones (user email, slugs) are part of what's under test.
  await mongoose.connection.dropDatabase();
  await mongoose.connection.syncIndexes();
  await redis.flushdb();

  const { httpServer, io } = createHttpServer();
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const { port } = httpServer.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    io,
    async close() {
      // Also closes httpServer and every connected socket.
      await io.close();
      setIo(null);
      await disconnectDB();
      disconnectRedis();
    },
  };
}

/**
 * Empties every collection (keeping indexes) and the test Redis DB: cache,
 * presence and rate-limit keys. Run before each test so tests can't see each
 * other's data or rate-limit counters.
 */
export async function resetData(): Promise<void> {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
  await redis.flushdb();
  testOutbox.length = 0;
}

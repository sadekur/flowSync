import http from "node:http";
import { createApp } from "./app";
import { createSocketServer } from "./sockets";
import { setIo } from "./sockets/emitter";
import type { IoServer } from "./sockets/types";

/**
 * The REST app and Socket.IO on one HTTP server, with `io` published to the
 * REST layer (task controllers broadcast through it). The one wiring used by
 * every way the backend runs: `server.ts` (listens on PORT — dev, Docker),
 * `vercel.ts` (exports the server to Vercel Functions) and the test harness.
 *
 * http.createServer wraps the app (rather than app.listen) so Socket.IO shares
 * the same server/port as the REST API.
 */
export function createHttpServer(): { httpServer: http.Server; io: IoServer } {
  const httpServer = http.createServer(createApp());
  const io = createSocketServer(httpServer);
  setIo(io);
  return { httpServer, io };
}

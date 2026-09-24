import type { ExtendedError } from "socket.io";
import { verifyAccessToken } from "../utils/jwt";
import { ACCESS_COOKIE } from "../utils/cookies";
import type { IoSocket } from "./types";

/**
 * Handshake auth — the socket equivalent of middleware/requireAuth.ts. Reads
 * the same httpOnly access-token cookie (parsed onto the handshake request by
 * the cookie-parser registered via io.engine.use() in sockets/index.ts).
 * Runs once per connection, including every automatic reconnect.
 */
export function socketAuth(socket: IoSocket, next: (err?: ExtendedError) => void): void {
  const cookies = (socket.request as { cookies?: Record<string, string> }).cookies;
  const token = cookies?.[ACCESS_COOKIE];

  if (!token) {
    next(new Error("Not authenticated"));
    return;
  }

  try {
    socket.data.userId = verifyAccessToken(token).sub;
    next();
  } catch {
    next(new Error("Invalid or expired access token"));
  }
}

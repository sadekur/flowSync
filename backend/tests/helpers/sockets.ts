import { io as connect, type ManagerOptions, type Socket, type SocketOptions } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "../../src/sockets/types";
import type { TestUser } from "./api";

export type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export const FRONTEND_ORIGIN = "http://localhost:3000";

type ConnectOptions = Partial<ManagerOptions & SocketOptions> & {
  /** Origin header to send; `null` sends none (default: the frontend's). */
  origin?: string | null;
  /** Cookie header to send instead of the user's (default: the user's jar). */
  cookie?: string;
};

/**
 * Opens a socket the way the browser would: the user's auth cookies and the
 * frontend's Origin on the handshake. Node clients can't use
 * `withCredentials`, so both go in as explicit headers. No auto-reconnect
 * unless a test asks for it.
 */
export function openSocket(baseUrl: string, user: TestUser | null, options: ConnectOptions = {}): ClientSocket {
  const { origin = FRONTEND_ORIGIN, cookie, ...rest } = options;
  const extraHeaders: Record<string, string> = {};
  if (origin !== null) extraHeaders.origin = origin;
  const cookieHeader = cookie ?? user?.client.cookieHeader;
  if (cookieHeader) extraHeaders.cookie = cookieHeader;

  return connect(baseUrl, {
    transports: ["websocket"],
    reconnection: false,
    forceNew: true,
    ...rest,
    // Merged, so a test's own extraHeaders (e.g. x-forwarded-host) add to the
    // cookie and Origin instead of replacing them.
    extraHeaders: { ...extraHeaders, ...rest.extraHeaders },
  });
}

/** Opens a socket and waits for it to connect; rejects with the connect_error. */
export function connectSocket(baseUrl: string, user: TestUser | null, options?: ConnectOptions): Promise<ClientSocket> {
  const socket = openSocket(baseUrl, user, options);
  return new Promise((resolve, reject) => {
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", (err) => {
      socket.close();
      reject(err);
    });
  });
}

/** Resolves with the connect_error message a handshake is rejected with. */
export function expectConnectError(baseUrl: string, user: TestUser | null, options?: ConnectOptions): Promise<string> {
  const socket = openSocket(baseUrl, user, options);
  return new Promise((resolve, reject) => {
    socket.once("connect", () => {
      socket.close();
      reject(new Error("expected the handshake to be rejected, but it connected"));
    });
    socket.once("connect_error", (err) => {
      socket.close();
      resolve(err.message);
    });
  });
}

/** Resolves with the next payload of `event`, or rejects after `timeoutMs`. */
export function nextEvent<E extends keyof ServerToClientEvents>(
  socket: ClientSocket,
  event: E,
  timeoutMs = 3_000,
): Promise<Parameters<ServerToClientEvents[E]>[0]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler as never);
      reject(new Error(`timed out waiting for "${String(event)}"`));
    }, timeoutMs);
    const handler = (payload: Parameters<ServerToClientEvents[E]>[0]) => {
      clearTimeout(timer);
      resolve(payload);
    };
    socket.once(event, handler as never);
  });
}

/**
 * Collects every payload of `event` from now on. Used to assert that something
 * was *not* delivered: by the time a later event has been seen (or a short
 * settle has passed), anything that was going to arrive has.
 */
export function recordEvents<E extends keyof ServerToClientEvents>(
  socket: ClientSocket,
  event: E,
): Parameters<ServerToClientEvents[E]>[0][] {
  const seen: Parameters<ServerToClientEvents[E]>[0][] = [];
  socket.on(event, ((payload: Parameters<ServerToClientEvents[E]>[0]) => seen.push(payload)) as never);
  return seen;
}

export const settle = (ms = 200) => new Promise((resolve) => setTimeout(resolve, ms));

/** Joins a project room and returns the ack. */
export function join(socket: ClientSocket, projectId: string) {
  return socket.timeout(3_000).emitWithAck("project:join", { projectId });
}

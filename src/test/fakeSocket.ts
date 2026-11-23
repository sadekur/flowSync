// A stand-in for the socket.io-client module, for frontend tests:
//
//   vi.mock("socket.io-client", () => import("@/test/fakeSocket"));
//
// socketMiddleware then gets a FakeSocket from `io()`, and the test plays the
// server: connect it, drop it, push events, and answer the client's emits.
// The real client is exercised against the real server in
// backend/tests/reconnect.test.ts; this one is for the cases that are hard to
// produce on demand there (stale acks, timeouts, typing throttles).

type Handler = (...args: any[]) => void;

export interface Emitted {
  event: string;
  payload: any;
  /** Answers the emit as the server would: `{ ok: true, ... }` or `{ ok: false, error }`. */
  ack: (response: unknown) => void;
  /** Only for emits made through `socket.timeout(ms)`: fires the timeout error. */
  timeOut?: () => void;
}

export class FakeSocket {
  connected = false;
  /** Like the real client: true while it is connected or will keep retrying. */
  active = false;
  readonly emitted: Emitted[] = [];
  private readonly handlers = new Map<string, Handler[]>();

  constructor(
    readonly url: string,
    readonly options: Record<string, unknown>,
  ) {}

  on(event: string, handler: Handler): this {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
    return this;
  }

  connect(): this {
    // The handshake only "completes" when the test calls serverAccept().
    this.active = true;
    return this;
  }

  disconnect(): this {
    const wasConnected = this.connected;
    this.connected = false;
    this.active = false;
    if (wasConnected) this.fire("disconnect", "io client disconnect");
    return this;
  }

  emit(event: string, payload: unknown, ack?: Handler): this {
    this.emitted.push({ event, payload, ack: (response) => ack?.(response) });
    return this;
  }

  timeout(_ms: number) {
    return {
      emit: (event: string, payload: unknown, callback: (err: Error | null, response?: unknown) => void) => {
        this.emitted.push({
          event,
          payload,
          ack: (response) => callback(null, response),
          timeOut: () => callback(new Error("operation has timed out")),
        });
      },
    };
  }

  // ---- test controls, playing the server ----

  /** The handshake succeeds (first connect or a reconnect). */
  serverAccept(): void {
    this.connected = true;
    this.active = true;
    this.fire("connect");
  }

  /** The handshake is refused: like an auth failure, the client stops retrying. */
  serverReject(message: string): void {
    this.connected = false;
    this.active = false;
    this.fire("connect_error", new Error(message));
  }

  /** The connection drops (network); the client keeps `active` and will retry. */
  dropConnection(): void {
    this.connected = false;
    this.fire("disconnect", "transport close");
  }

  /** A server → client event. */
  serverEmit(event: string, payload: unknown): void {
    this.fire(event, payload);
  }

  emitsOf(event: string): Emitted[] {
    return this.emitted.filter((e) => e.event === event);
  }

  lastEmit(event: string): Emitted {
    const found = this.emitsOf(event).at(-1);
    if (!found) throw new Error(`no "${event}" was emitted`);
    return found;
  }

  private fire(event: string, ...args: unknown[]): void {
    for (const handler of this.handlers.get(event) ?? []) handler(...args);
  }
}

const sockets: FakeSocket[] = [];

/** The module's `io` export: socketMiddleware creates one socket per store. */
export function io(url: string, options: Record<string, unknown> = {}): FakeSocket {
  const socket = new FakeSocket(url, options);
  sockets.push(socket);
  return socket;
}

/** The socket most recently created by a store. */
export function latestSocket(): FakeSocket {
  const socket = sockets.at(-1);
  if (!socket) throw new Error("no socket has been created yet (dispatch socketConnect first)");
  return socket;
}

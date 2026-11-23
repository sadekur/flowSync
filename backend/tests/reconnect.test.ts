import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { startTestServer, resetData, type TestServer } from "./helpers/server";
import { createFixture, type Fixture } from "./helpers/api";
import {
  connectSocket,
  FRONTEND_ORIGIN,
  join,
  nextEvent,
  recordEvents,
  settle,
  type ClientSocket,
} from "./helpers/sockets";
import { makeStore, type AppStore } from "@/store";
import { joinProject, socketConnect, socketDisconnect, type SocketStatus } from "@/store/socketSlice";
import { messagesHydrated } from "@/store/messagesSlice";
import { tasksHydrated } from "@/store/tasksSlice";

// The store's socketMiddleware calls `io(NEXT_PUBLIC_SOCKET_URL, { withCredentials: true })`.
// In a browser, withCredentials is what attaches the httpOnly auth cookie;
// Node has no cookie store, so this wraps only that call (recognised by
// withCredentials — the test helpers never set it) to point at the test server
// with the cookie and Origin a browser would send, and to retry quickly.
// Everything else about the client — reconnection, events, acks — is real.
const browser = vi.hoisted(() => ({ url: "", headers: {} as Record<string, string> }));
vi.mock("socket.io-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("socket.io-client")>();
  const io = ((url: string, opts: Record<string, unknown> = {}) =>
    opts.withCredentials
      ? actual.io(browser.url, {
          ...opts,
          transports: ["websocket"],
          extraHeaders: browser.headers,
          reconnectionDelay: 50,
          reconnectionDelayMax: 100,
        })
      : actual.io(url, opts)) as typeof actual.io;
  return { ...actual, io, default: io };
});

let server: TestServer;
const open: ClientSocket[] = [];
const stores: AppStore[] = [];

beforeAll(async () => {
  server = await startTestServer();
});
afterAll(async () => {
  await server.close();
});
beforeEach(resetData);
afterEach(() => {
  for (const socket of open.splice(0)) socket.close();
  for (const store of stores.splice(0)) store.dispatch(socketDisconnect());
});

async function connect(...args: Parameters<typeof connectSocket>): Promise<ClientSocket> {
  const socket = await connectSocket(...args);
  open.push(socket);
  return socket;
}

/**
 * Simulates a network drop for every socket `userId` has on the server:
 * closing the underlying transport (not `socket.disconnect()`, which is a
 * deliberate server kick the client won't retry) makes the client see
 * "transport close" and reconnect on its own.
 */
function dropConnections(userId: string): number {
  let dropped = 0;
  for (const socket of server.io.of("/").sockets.values()) {
    if (socket.data.userId === userId) {
      socket.conn.close();
      dropped++;
    }
  }
  return dropped;
}

const once = (socket: ClientSocket, event: "connect" | "disconnect") =>
  new Promise<void>((resolve) => socket.once(event, () => resolve()));

const send = (socket: ClientSocket, projectId: string, text: string) =>
  socket.timeout(3_000).emitWithAck("message:send", { projectId, text });

describe("server side of a reconnect", () => {
  let f: Fixture;
  beforeEach(async () => {
    f = await createFixture(server.url);
  });

  it("drops the room on reconnect until the client re-joins, and ?after= recovers what was missed", async () => {
    const owner = await connect(server.url, f.owner);
    const member = await connect(server.url, f.member, { reconnection: true, reconnectionDelay: 50 });
    await join(owner, f.project._id);
    await join(member, f.project._id);

    const first = await send(owner, f.project._id, "before the drop");
    if (!first.ok) throw new Error(first.error);

    const disconnected = once(member, "disconnect");
    const reconnected = once(member, "connect");
    expect(dropConnections(f.member.id)).toBe(1);
    await disconnected;
    await reconnected;

    // Back online but not back in the room: this one isn't delivered.
    const memberSaw = recordEvents(member, "message:new");
    await send(owner, f.project._id, "while out of the room");
    await settle();
    expect(memberSaw).toEqual([]);

    // Re-joining restores live delivery…
    await join(member, f.project._id);
    const live = nextEvent(member, "message:new");
    await send(owner, f.project._id, "after the re-join");
    expect((await live).text).toBe("after the re-join");

    // …and the catch-up read the chat UI does on every (re)join fills the gap.
    const gap = await f.member.client.get(`${f.projectPath}/messages?after=${first.message._id}`);
    expect(gap.body.messages.map((m: { text: string }) => m.text)).toEqual([
      "while out of the room",
      "after the re-join",
    ]);
  });

  it("takes the user offline on the drop and online again on the re-join, without leaking the presence count", async () => {
    const watcher = await connect(server.url, f.owner);
    await join(watcher, f.project._id);
    const member = await connect(server.url, f.member, { reconnection: true, reconnectionDelay: 50 });
    await join(member, f.project._id);

    const wentOffline = nextEvent(watcher, "user:offline");
    const reconnected = once(member, "connect");
    dropConnections(f.member.id);
    expect(await wentOffline).toEqual({ projectId: f.project._id, userId: f.member.id });
    await reconnected;

    const backOnline = nextEvent(watcher, "user:online");
    const snapshot = await join(member, f.project._id);
    expect(await backOnline).toEqual({ projectId: f.project._id, userId: f.member.id });
    expect(snapshot.ok && snapshot.onlineUserIds.sort()).toEqual([f.owner.id, f.member.id].sort());

    // If the dropped socket's count had leaked, this leave would leave the
    // count at 1 and no user:offline would follow.
    const offlineAgain = nextEvent(watcher, "user:offline");
    await member.timeout(3_000).emitWithAck("project:leave", { projectId: f.project._id });
    expect(await offlineAgain).toEqual({ projectId: f.project._id, userId: f.member.id });
  });

  it("re-checks auth on every reconnect and stops retrying once it's rejected", async () => {
    const member = await connect(server.url, f.member, { reconnection: true, reconnectionDelay: 50 });

    // The access cookie has gone bad by the time the client reconnects.
    (member.io.opts.extraHeaders as Record<string, string>).cookie = "accessToken=expired";
    const rejected = new Promise<string>((resolve) => member.once("connect_error", (err) => resolve(err.message)));
    dropConnections(f.member.id);

    expect(await rejected).toBe("Invalid or expired access token");
    await settle(300);
    expect(member.connected).toBe(false);
    expect(member.active).toBe(false);
  });
});

describe("socketMiddleware against the real server", () => {
  let f: Fixture;

  function createBrowserStore(cookie: string): { store: AppStore; statuses: SocketStatus[] } {
    browser.url = server.url;
    browser.headers = { cookie, origin: FRONTEND_ORIGIN };
    const store = makeStore();
    stores.push(store);
    const statuses: SocketStatus[] = [];
    store.subscribe(() => {
      const status = store.getState().socket.status;
      if (statuses.at(-1) !== status) statuses.push(status);
    });
    return { store, statuses };
  }

  beforeEach(async () => {
    f = await createFixture(server.url);
  });

  it("re-joins the open project by itself after a drop and keeps receiving live updates", async () => {
    const { store, statuses } = createBrowserStore(f.member.client.cookieHeader);
    const projectId = f.project._id;
    // What the project page does on mount.
    store.dispatch(messagesHydrated({ projectId, messages: [], hasOlder: false }));
    store.dispatch(tasksHydrated({ projectId, tasks: [] }));
    store.dispatch(socketConnect());
    store.dispatch(joinProject(projectId));

    await vi.waitFor(() => expect(store.getState().socket.joinedProjectId).toBe(projectId));
    expect(store.getState().presence.onlineUserIds).toEqual([f.member.id]);

    dropConnections(f.member.id);
    await vi.waitFor(() => expect(statuses).toContain("reconnecting"));
    // The room is gone with the connection, so the UI must stop claiming "live"…
    // …until the middleware's own re-join is acked.
    await vi.waitFor(() => {
      expect(store.getState().socket.status).toBe("connected");
      expect(store.getState().socket.joinedProjectId).toBe(projectId);
    });
    expect(statuses).toEqual(["connecting", "connected", "reconnecting", "connected"]);

    // Proof the room really was re-joined server-side: live chat and task
    // events reach the store.
    const owner = await connect(server.url, f.owner);
    const sent = await send(owner, projectId, "after the reconnect");
    const task = await f.owner.client.post(`${f.projectPath}/tasks`, { title: "Created after the reconnect" });

    await vi.waitFor(() => {
      const state = store.getState();
      expect(sent.ok && state.messages.ids).toContain(sent.ok && sent.message._id);
      expect(state.tasks.ids).toContain(task.body.task._id);
    });
  });

  it("re-joins after every drop, not just the first", async () => {
    const { store } = createBrowserStore(f.member.client.cookieHeader);
    store.dispatch(socketConnect());
    store.dispatch(joinProject(f.project._id));
    await vi.waitFor(() => expect(store.getState().socket.joinedProjectId).toBe(f.project._id));

    for (let i = 0; i < 3; i++) {
      dropConnections(f.member.id);
      await vi.waitFor(() => expect(store.getState().socket.joinedProjectId).toBeNull());
      await vi.waitFor(() => expect(store.getState().socket.joinedProjectId).toBe(f.project._id));
    }
    const watcher = await connect(server.url, f.owner);
    const snapshot = await join(watcher, f.project._id);
    // Exactly one live socket for the member after three drops.
    expect(snapshot.ok && snapshot.onlineUserIds.sort()).toEqual([f.owner.id, f.member.id].sort());
  });

  it("ends in 'error' without retrying when the handshake is rejected", async () => {
    const { store } = createBrowserStore("accessToken=forged");
    store.dispatch(socketConnect());
    await vi.waitFor(() => expect(store.getState().socket.status).toBe("error"));
    expect(store.getState().socket.error).toBe("Invalid or expired access token");
    await settle(300);
    expect(store.getState().socket.status).toBe("error");
  });
});

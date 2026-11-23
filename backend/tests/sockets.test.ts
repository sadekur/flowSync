import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startTestServer, resetData, type TestServer } from "./helpers/server";
import { createFixture, registerUser } from "./helpers/api";
import {
  connectSocket,
  expectConnectError,
  join,
  nextEvent,
  recordEvents,
  settle,
  type ClientSocket,
} from "./helpers/sockets";
import { Message } from "../src/models/Message";

let server: TestServer;
const open: ClientSocket[] = [];

beforeAll(async () => {
  server = await startTestServer();
});
afterAll(async () => {
  await server.close();
});
beforeEach(resetData);
afterEach(() => {
  for (const socket of open.splice(0)) socket.close();
});

async function connect(...args: Parameters<typeof connectSocket>): Promise<ClientSocket> {
  const socket = await connectSocket(...args);
  open.push(socket);
  return socket;
}

const send = (socket: ClientSocket, projectId: string, text: string) =>
  socket.timeout(3_000).emitWithAck("message:send", { projectId, text });

describe("handshake", () => {
  it("accepts a valid access cookie with the frontend's Origin", async () => {
    const alice = await registerUser(server.url, "Alice");
    const socket = await connect(server.url, alice);
    expect(socket.connected).toBe(true);
  });

  it("rejects a missing or invalid access cookie", async () => {
    expect(await expectConnectError(server.url, null)).toBe("Not authenticated");
    expect(await expectConnectError(server.url, null, { cookie: "accessToken=forged" })).toBe(
      "Invalid or expired access token",
    );
  });

  it.each(["websocket", "polling"] as const)("rejects a foreign or missing Origin over %s", async (transport) => {
    const alice = await registerUser(server.url, "Alice");
    for (const origin of ["https://evil.example", null]) {
      const message = await expectConnectError(server.url, alice, { origin, transports: [transport] });
      // Refused in allowRequest, before auth runs — not an auth error.
      expect(message).not.toMatch(/authenticated|token/i);
    }
  });
});

describe("project:join / project:leave", () => {
  it("lets a member join by ObjectId and returns the presence snapshot", async () => {
    const f = await createFixture(server.url);
    const socket = await connect(server.url, f.member);
    const res = await join(socket, f.project._id);
    expect(res).toEqual({ ok: true, onlineUserIds: [f.member.id] });
    expect(await socket.timeout(3_000).emitWithAck("project:leave", { projectId: f.project._id })).toEqual({
      ok: true,
    });
  });

  it("refuses a slug, a bad id, a project that doesn't exist and a non-member", async () => {
    const f = await createFixture(server.url);
    const member = await connect(server.url, f.member);
    const outsider = await connect(server.url, f.outsider);

    expect(await join(member, f.project.slug)).toEqual({ ok: false, error: "Invalid projectId" });
    expect(await join(member, "nope")).toEqual({ ok: false, error: "Invalid projectId" });
    const missing = await join(member, "000000000000000000000000");
    const forbidden = await join(outsider, f.project._id);
    // The same answer for both, so ids can't be probed.
    expect(missing).toEqual({ ok: false, error: "Project not found" });
    expect(forbidden).toEqual(missing);
  });
});

describe("message:send", () => {
  it("saves, acks and broadcasts to the room (sender included), but not to outsiders", async () => {
    const f = await createFixture(server.url);
    const owner = await connect(server.url, f.owner);
    const member = await connect(server.url, f.member);
    const outsider = await connect(server.url, f.outsider);
    await join(owner, f.project._id);
    await join(member, f.project._id);
    const outsiderSaw = recordEvents(outsider, "message:new");

    const ownerGets = nextEvent(owner, "message:new");
    const memberGets = nextEvent(member, "message:new");
    const ack = await send(owner, f.project._id, "  <script>alert(1)</script>  ");

    expect(ack.ok).toBe(true);
    if (!ack.ok) return;
    // Trimmed, stored verbatim as plain text.
    expect(ack.message).toMatchObject({
      project: f.project._id,
      sender: { _id: f.owner.id, name: "Owner" },
      text: "<script>alert(1)</script>",
    });
    expect(await ownerGets).toEqual(ack.message);
    expect(await memberGets).toEqual(ack.message);
    await settle();
    expect(outsiderSaw).toEqual([]);
    expect(await Message.countDocuments({ project: f.project._id })).toBe(1);
  });

  it("validates the text and the project id", async () => {
    const f = await createFixture(server.url);
    const owner = await connect(server.url, f.owner);
    expect(await send(owner, f.project._id, "   ")).toEqual({ ok: false, error: "text is required" });
    expect(await send(owner, f.project._id, "x".repeat(2001))).toEqual({ ok: false, error: "text is too long" });
    expect((await send(owner, f.project._id, "x".repeat(2000))).ok).toBe(true);
    expect(await send(owner, f.project.slug, "hi")).toEqual({ ok: false, error: "must be a valid id" });
  });

  it("refuses a non-member", async () => {
    const f = await createFixture(server.url);
    const outsider = await connect(server.url, f.outsider);
    expect(await send(outsider, f.project._id, "let me in")).toEqual({ ok: false, error: "Project not found" });
  });

  it("re-checks membership on every send: a removed member can't post from a room they're still in", async () => {
    const f = await createFixture(server.url);
    const member = await connect(server.url, f.member);
    await join(member, f.project._id);
    // Warms the cached member list that the socket check reads.
    expect((await send(member, f.project._id, "before")).ok).toBe(true);

    await f.owner.client.delete(`/api/workspaces/${f.workspace._id}/members/${f.member.id}`);

    expect(await send(member, f.project._id, "after")).toEqual({ ok: false, error: "Project not found" });
    expect(await Message.countDocuments({ text: "after" })).toBe(0);
  });

  it("rate-limits each user to 20 sends per 10 s across all of their sockets", async () => {
    const f = await createFixture(server.url);
    const tabA = await connect(server.url, f.owner);
    const tabB = await connect(server.url, f.owner);
    for (let i = 0; i < 20; i++) {
      const res = await send(i % 2 ? tabA : tabB, f.project._id, `msg ${i}`);
      expect(res.ok).toBe(true);
    }
    expect(await send(tabA, f.project._id, "one too many")).toEqual({
      ok: false,
      error: "You're sending messages too fast",
    });
    // Another user has their own budget.
    const member = await connect(server.url, f.member);
    expect((await send(member, f.project._id, "still fine")).ok).toBe(true);
  });

  it("notifies the other members over their own user room, even outside the project", async () => {
    const f = await createFixture(server.url);
    const owner = await connect(server.url, f.owner);
    // The member is connected but has not joined the project room.
    const member = await connect(server.url, f.member);
    const ownerNotified = recordEvents(owner, "notification:new");

    const notified = nextEvent(member, "notification:new");
    await send(owner, f.project._id, "hello team");
    expect(await notified).toMatchObject({
      type: "message",
      actor: { _id: f.owner.id, name: "Owner" },
      project: f.project._id,
      preview: "hello team",
    });
    await settle();
    expect(ownerNotified).toEqual([]);
  });
});

describe("typing", () => {
  it("relays start/stop to the room, excluding the sender", async () => {
    const f = await createFixture(server.url);
    const owner = await connect(server.url, f.owner);
    const member = await connect(server.url, f.member);
    await join(owner, f.project._id);
    await join(member, f.project._id);
    const ownerSaw = recordEvents(owner, "typing:start");

    const started = nextEvent(member, "typing:start");
    expect(await owner.timeout(3_000).emitWithAck("typing:start", { projectId: f.project._id })).toEqual({ ok: true });
    expect(await started).toEqual({ projectId: f.project._id, userId: f.owner.id });

    const stopped = nextEvent(member, "typing:stop");
    await owner.timeout(3_000).emitWithAck("typing:stop", { projectId: f.project._id });
    expect(await stopped).toEqual({ projectId: f.project._id, userId: f.owner.id });
    expect(ownerSaw).toEqual([]);
  });

  it("refuses typing:start from a non-member", async () => {
    const f = await createFixture(server.url);
    const outsider = await connect(server.url, f.outsider);
    expect(await outsider.timeout(3_000).emitWithAck("typing:start", { projectId: f.project._id })).toEqual({
      ok: false,
      error: "Project not found",
    });
  });
});

describe("presence", () => {
  it("counts sockets per user: one user:online for the first tab, user:offline only after the last", async () => {
    const f = await createFixture(server.url);
    const watcher = await connect(server.url, f.owner);
    await join(watcher, f.project._id);
    const online = recordEvents(watcher, "user:online");
    const offline = recordEvents(watcher, "user:offline");

    const tab1 = await connect(server.url, f.member);
    const tab2 = await connect(server.url, f.member);
    await join(tab1, f.project._id);
    const snapshot = await join(tab2, f.project._id);
    expect(snapshot.ok && snapshot.onlineUserIds.sort()).toEqual([f.owner.id, f.member.id].sort());
    await settle();
    expect(online).toEqual([{ projectId: f.project._id, userId: f.member.id }]);

    // Closing one of two tabs keeps the user online.
    tab1.close();
    await settle();
    expect(offline).toEqual([]);

    // Leaving with the last one takes them offline.
    const wentOffline = nextEvent(watcher, "user:offline");
    await tab2.timeout(3_000).emitWithAck("project:leave", { projectId: f.project._id });
    expect(await wentOffline).toEqual({ projectId: f.project._id, userId: f.member.id });

    const rejoin = await join(watcher, f.project._id);
    expect(rejoin.ok && rejoin.onlineUserIds).toEqual([f.owner.id]);
  });
});

describe("task events from REST writes", () => {
  it("broadcasts task:created / task:updated / task:deleted to the project room only", async () => {
    const f = await createFixture(server.url);
    const member = await connect(server.url, f.member);
    await join(member, f.project._id);
    // Connected but not in the room: gets nothing.
    const bystander = await connect(server.url, f.owner);
    const bystanderSaw = recordEvents(bystander, "task:created");

    const created = nextEvent(member, "task:created");
    const res = await f.owner.client.post(`${f.projectPath}/tasks`, { title: "Live" });
    // Same JSON shape as the REST response.
    expect(await created).toEqual(res.body.task);

    const updated = nextEvent(member, "task:updated");
    const patch = await f.owner.client.patch(`${f.projectPath}/tasks/${res.body.task._id}`, { status: "done" });
    expect(await updated).toEqual(patch.body.task);

    const deleted = nextEvent(member, "task:deleted");
    await f.owner.client.delete(`${f.projectPath}/tasks/${res.body.task._id}`);
    expect(await deleted).toEqual({ projectId: f.project._id, taskId: res.body.task._id });

    expect(bystanderSaw).toEqual([]);
  });

  it("pushes notification:new to the assignee's user room", async () => {
    const f = await createFixture(server.url);
    const member = await connect(server.url, f.member);
    const notified = nextEvent(member, "notification:new");
    await f.owner.client.post(`${f.projectPath}/tasks`, { title: "Yours", assignee: f.member.id });
    expect(await notified).toMatchObject({ type: "task_assigned", preview: "Yours", project: f.project._id });
  });
});

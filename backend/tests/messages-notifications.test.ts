import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startTestServer, resetData, type TestServer } from "./helpers/server";
import { createFixture, TestClient, type Fixture } from "./helpers/api";
import { createMessage } from "../src/services/message.service";

let server: TestServer;

beforeAll(async () => {
  server = await startTestServer();
});
afterAll(async () => {
  await server.close();
});
beforeEach(resetData);

/** Seeds `count` messages straight through the service (sending over the
 *  socket would hit the 20-per-10s rate limit) and returns their ids, oldest first. */
async function seedMessages(f: Fixture, count: number): Promise<string[]> {
  const ref = { _id: f.project._id, workspace: f.workspace._id };
  const ids: string[] = [];
  for (let i = 0; i < count; i++) ids.push((await createMessage(ref, f.owner.id, `message ${i}`))._id);
  return ids;
}

const idsOf = (body: { messages: { _id: string }[] }) => body.messages.map((m) => m._id);

describe("GET …/messages", () => {
  it("returns the newest page oldest-first, with hasMore for older history", async () => {
    const f = await createFixture(server.url);
    const ids = await seedMessages(f, 5);

    const res = await f.member.client.get(`${f.projectPath}/messages?limit=3`);
    expect(res.status).toBe(200);
    expect(idsOf(res.body)).toEqual(ids.slice(2));
    expect(res.body.hasMore).toBe(true);
    expect(res.body.messages[0]).toMatchObject({
      project: f.project._id,
      sender: { _id: f.owner.id, name: "Owner" },
      text: "message 2",
    });
    // Only the sender's id and name are exposed.
    expect(res.body.messages[0].sender).not.toHaveProperty("email");
  });

  it("pages back with `before` and catches up with `after`", async () => {
    const f = await createFixture(server.url);
    const ids = await seedMessages(f, 5);

    const older = await f.member.client.get(`${f.projectPath}/messages?before=${ids[2]}&limit=50`);
    expect(idsOf(older.body)).toEqual(ids.slice(0, 2));
    expect(older.body.hasMore).toBe(false);

    const newer = await f.member.client.get(`${f.projectPath}/messages?after=${ids[1]}&limit=2`);
    expect(idsOf(newer.body)).toEqual(ids.slice(2, 4));
    expect(newer.body.hasMore).toBe(true);

    const caughtUp = await f.member.client.get(`${f.projectPath}/messages?after=${ids[4]}`);
    expect(caughtUp.body).toEqual({ messages: [], hasMore: false });
  });

  it("rejects bad queries with 400", async () => {
    const f = await createFixture(server.url);
    const [id] = await seedMessages(f, 1);
    for (const query of [`before=${id}&after=${id}`, "limit=51", "limit=0", "before=nope"]) {
      expect((await f.member.client.get(`${f.projectPath}/messages?${query}`)).status, query).toBe(400);
    }
  });

  it("is closed to non-members (403) and anonymous callers (401)", async () => {
    const f = await createFixture(server.url);
    expect((await f.outsider.client.get(`${f.projectPath}/messages`)).status).toBe(403);
    expect((await new TestClient(server.url).get(`${f.projectPath}/messages`)).status).toBe(401);
  });
});

describe("notifications", () => {
  it("notifies the assignee (not the actor) of an assignment and later updates", async () => {
    const f = await createFixture(server.url);
    const task = (await f.owner.client.post(`${f.projectPath}/tasks`, { title: "Review", assignee: f.member.id }))
      .body.task;

    let list = await f.member.client.get("/api/notifications");
    expect(list.status).toBe(200);
    expect(list.body.unreadCount).toBe(1);
    expect(list.body.notifications[0]).toMatchObject({
      type: "task_assigned",
      read: false,
      actor: { _id: f.owner.id, name: "Owner" },
      workspace: f.workspace._id,
      project: f.project._id,
      task: task._id,
      preview: "Review",
    });
    expect((await f.owner.client.get("/api/notifications")).body.unreadCount).toBe(0);

    await f.owner.client.patch(`${f.projectPath}/tasks/${task._id}`, { status: "done" });
    list = await f.member.client.get("/api/notifications");
    expect(list.body.notifications.map((n: { type: string }) => n.type)).toEqual(["task_updated", "task_assigned"]);
    expect(list.body.unreadCount).toBe(2);
  });

  it("treats a reassignment as a fresh assignment for the new assignee", async () => {
    const f = await createFixture(server.url);
    const task = (await f.owner.client.post(`${f.projectPath}/tasks`, { title: "Hand-off", assignee: f.member.id }))
      .body.task;
    // The member hands it back to the owner.
    await f.member.client.patch(`${f.projectPath}/tasks/${task._id}`, { assignee: f.owner.id });

    const ownerList = (await f.owner.client.get("/api/notifications")).body;
    expect(ownerList.notifications.map((n: { type: string }) => n.type)).toEqual(["task_assigned"]);
  });

  it("doesn't notify someone who assigns a task to themselves", async () => {
    const f = await createFixture(server.url);
    await f.owner.client.post(`${f.projectPath}/tasks`, { title: "Self", assignee: f.owner.id });
    expect((await f.owner.client.get("/api/notifications")).body.notifications).toEqual([]);
  });

  it("marks everything read (CSRF required)", async () => {
    const f = await createFixture(server.url);
    await f.owner.client.post(`${f.projectPath}/tasks`, { title: "One", assignee: f.member.id });
    await f.owner.client.post(`${f.projectPath}/tasks`, { title: "Two", assignee: f.member.id });

    expect((await f.member.client.post("/api/notifications/read", undefined, { csrf: false })).status).toBe(403);
    expect((await f.member.client.post("/api/notifications/read")).status).toBe(204);

    const list = (await f.member.client.get("/api/notifications")).body;
    expect(list.unreadCount).toBe(0);
    expect(list.notifications.every((n: { read: boolean }) => n.read)).toBe(true);
  });

  it("requires auth (401)", async () => {
    expect((await new TestClient(server.url).get("/api/notifications")).status).toBe(401);
  });
});

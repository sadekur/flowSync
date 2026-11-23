import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startTestServer, resetData, type TestServer } from "./helpers/server";
import { createFixture, registerUser, TestClient } from "./helpers/api";
import { Project } from "../src/models/Project";
import { Task } from "../src/models/Task";
import { Message } from "../src/models/Message";
import { createMessage } from "../src/services/message.service";
import { Notification } from "../src/models/Notification";
import { Workspace } from "../src/models/Workspace";

let server: TestServer;

beforeAll(async () => {
  server = await startTestServer();
});
afterAll(async () => {
  await server.close();
});
beforeEach(resetData);

const ids = (list: { _id: string }[]) => list.map((w) => w._id);

describe("auth and CSRF guards", () => {
  it("rejects unauthenticated requests with 401", async () => {
    expect((await new TestClient(server.url).get("/api/workspaces")).status).toBe(401);
  });

  it("rejects a mutation without the CSRF header with 403", async () => {
    const alice = await registerUser(server.url, "Alice");
    const res = await alice.client.post("/api/workspaces", { name: "No CSRF" }, { csrf: false });
    expect(res.status).toBe(403);
    expect(await Workspace.countDocuments()).toBe(0);
  });
});

describe("create, list and read", () => {
  it("makes the creator owner and sole member, with a slug from the name", async () => {
    const alice = await registerUser(server.url, "Alice");
    const res = await alice.client.post("/api/workspaces", { name: "Design Team" });
    expect(res.status).toBe(201);
    expect(res.body.workspace).toMatchObject({ name: "Design Team", owner: alice.id, members: [alice.id] });
    expect(res.body.workspace.slug).toMatch(/^design-team/);
  });

  it("gives two workspaces with the same name different slugs", async () => {
    const alice = await registerUser(server.url, "Alice");
    const a = await alice.client.post("/api/workspaces", { name: "Same" });
    const b = await alice.client.post("/api/workspaces", { name: "Same" });
    expect(a.body.workspace.slug).not.toBe(b.body.workspace.slug);
  });

  it("lists only the caller's workspaces, newest first, and the list follows writes (cache invalidation)", async () => {
    const alice = await registerUser(server.url, "Alice");
    const bob = await registerUser(server.url, "Bob");
    const first = (await alice.client.post("/api/workspaces", { name: "First" })).body.workspace;
    await bob.client.post("/api/workspaces", { name: "Bob's" });

    // Populates alice's cached list…
    expect(ids((await alice.client.get("/api/workspaces")).body.workspaces)).toEqual([first._id]);

    // …which a create must invalidate.
    const second = (await alice.client.post("/api/workspaces", { name: "Second" })).body.workspace;
    expect(ids((await alice.client.get("/api/workspaces")).body.workspaces)).toEqual([second._id, first._id]);

    // A rename shows up too, for the owner.
    await alice.client.patch(`/api/workspaces/${first._id}`, { name: "Renamed" });
    const names = (await alice.client.get("/api/workspaces")).body.workspaces.map((w: { name: string }) => w.name);
    expect(names).toEqual(["Second", "Renamed"]);
  });

  it("resolves a workspace by id or slug, with owner and members populated", async () => {
    const f = await createFixture(server.url);
    for (const key of [f.workspace._id, f.workspace.slug]) {
      const res = await f.member.client.get(`/api/workspaces/${key}`);
      expect(res.status).toBe(200);
      expect(res.body.workspace.owner).toMatchObject({ _id: f.owner.id, name: "Owner", email: f.owner.email });
      expect(res.body.workspace.members.map((m: { _id: string }) => m._id).sort()).toEqual(
        [f.owner.id, f.member.id].sort(),
      );
    }
  });

  it("answers 403 to a non-member and 404 to a workspace that doesn't exist", async () => {
    const f = await createFixture(server.url);
    expect((await f.outsider.client.get(`/api/workspaces/${f.workspace._id}`)).status).toBe(403);
    expect((await f.outsider.client.get("/api/workspaces/000000000000000000000000")).status).toBe(404);
    expect((await f.outsider.client.get("/api/workspaces/no-such-slug")).status).toBe(404);
  });
});

describe("owner-only actions", () => {
  it("lets only the owner rename or delete", async () => {
    const f = await createFixture(server.url);
    const path = `/api/workspaces/${f.workspace._id}`;
    expect((await f.member.client.patch(path, { name: "Hijacked" })).status).toBe(403);
    expect((await f.member.client.delete(path)).status).toBe(403);

    const renamed = await f.owner.client.patch(path, { name: "Renamed" });
    expect(renamed.status).toBe(200);
    expect(renamed.body.workspace.name).toBe("Renamed");
    // Slugs never change on rename, so existing links keep working.
    expect(renamed.body.workspace.slug).toBe(f.workspace.slug);
  });

  it("adds a member by email, and the new member's workspace list includes it at once", async () => {
    const alice = await registerUser(server.url, "Alice");
    const bob = await registerUser(server.url, "Bob");
    const ws = (await alice.client.post("/api/workspaces", { name: "Team" })).body.workspace;

    // Cache bob's (empty) list before he's added.
    expect((await bob.client.get("/api/workspaces")).body.workspaces).toEqual([]);

    const res = await alice.client.post(`/api/workspaces/${ws._id}/members`, { email: bob.email });
    expect(res.status).toBe(200);
    expect(ids((await bob.client.get("/api/workspaces")).body.workspaces)).toEqual([ws._id]);
  });

  it("rejects adding an unknown email (404), an existing member (409), or by a non-owner (403)", async () => {
    const f = await createFixture(server.url);
    const path = `/api/workspaces/${f.workspace._id}/members`;
    expect((await f.owner.client.post(path, { email: "nobody@example.com" })).status).toBe(404);
    expect((await f.owner.client.post(path, { email: f.member.email })).status).toBe(409);
    expect((await f.member.client.post(path, { email: f.outsider.email })).status).toBe(403);
  });

  it("removes a member, who then loses access and the workspace from their list", async () => {
    const f = await createFixture(server.url);
    // Cache the member's list while they still belong.
    expect(ids((await f.member.client.get("/api/workspaces")).body.workspaces)).toEqual([f.workspace._id]);

    const res = await f.owner.client.delete(`/api/workspaces/${f.workspace._id}/members/${f.member.id}`);
    expect(res.status).toBe(200);
    expect(res.body.workspace.members).toEqual([f.owner.id]);

    expect((await f.member.client.get("/api/workspaces")).body.workspaces).toEqual([]);
    expect((await f.member.client.get(`/api/workspaces/${f.workspace._id}`)).status).toBe(403);
    expect((await f.member.client.get(`${f.projectPath}/tasks`)).status).toBe(403);
  });

  it("refuses to remove the owner (400)", async () => {
    const f = await createFixture(server.url);
    const res = await f.owner.client.delete(`/api/workspaces/${f.workspace._id}/members/${f.owner.id}`);
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/workspaces/:id", () => {
  it("cascades to projects, tasks, messages and notifications", async () => {
    const f = await createFixture(server.url);
    // A task assigned to the member creates a notification as well.
    const task = await f.owner.client.post(`${f.projectPath}/tasks`, { title: "Ship it", assignee: f.member.id });
    expect(task.status).toBe(201);
    await createMessage({ _id: f.project._id, workspace: f.workspace._id }, f.owner.id, "hello");

    expect(await Notification.countDocuments()).toBe(1);

    // Some other workspace's data must survive.
    const other = (await f.outsider.client.post("/api/workspaces", { name: "Other" })).body.workspace;
    await f.outsider.client.post(`/api/workspaces/${other._id}/projects`, { name: "Kept" });

    expect((await f.owner.client.delete(`/api/workspaces/${f.workspace._id}`)).status).toBe(204);

    expect(await Workspace.exists({ _id: f.workspace._id })).toBeNull();
    expect(await Project.countDocuments({ workspace: f.workspace._id })).toBe(0);
    expect(await Task.countDocuments({ project: f.project._id })).toBe(0);
    expect(await Message.countDocuments({ project: f.project._id })).toBe(0);
    expect(await Notification.countDocuments({ workspace: f.workspace._id })).toBe(0);
    expect(await Project.countDocuments({ workspace: other._id })).toBe(1);

    // And it's gone from both members' lists.
    expect((await f.owner.client.get("/api/workspaces")).body.workspaces).toEqual([]);
    expect((await f.member.client.get("/api/workspaces")).body.workspaces).toEqual([]);
  });
});

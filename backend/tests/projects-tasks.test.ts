import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startTestServer, resetData, type TestServer } from "./helpers/server";
import { createFixture } from "./helpers/api";
import { Task } from "../src/models/Task";
import { Message } from "../src/models/Message";
import { Notification } from "../src/models/Notification";

let server: TestServer;

beforeAll(async () => {
  server = await startTestServer();
});
afterAll(async () => {
  await server.close();
});
beforeEach(resetData);

describe("projects", () => {
  it("lets any member create, list, read (by id or slug), update and delete", async () => {
    const f = await createFixture(server.url);
    const base = `/api/workspaces/${f.workspace.slug}/projects`;

    const created = await f.member.client.post(base, { name: "Roadmap", description: "Q1" });
    expect(created.status).toBe(201);
    const project = created.body.project;
    expect(project.slug).toMatch(/^roadmap/);

    const list = await f.member.client.get(base);
    expect(list.body.projects.map((p: { _id: string }) => p._id)).toEqual([project._id, f.project._id]);

    expect((await f.member.client.get(`${base}/${project.slug}`)).body.project._id).toBe(project._id);

    const updated = await f.member.client.patch(`${base}/${project._id}`, { name: "Roadmap 2" });
    expect(updated.status).toBe(200);
    expect(updated.body.project).toMatchObject({ name: "Roadmap 2", description: "Q1", slug: project.slug });

    expect((await f.member.client.delete(`${base}/${project._id}`)).status).toBe(204);
    expect((await f.member.client.get(`${base}/${project._id}`)).status).toBe(404);
  });

  it("can't be reached through another workspace's URL (404)", async () => {
    const f = await createFixture(server.url);
    // The outsider owns a workspace of their own, so they pass the membership
    // check there — but the project belongs to a different workspace.
    const own = (await f.outsider.client.post("/api/workspaces", { name: "Mine" })).body.workspace;
    const res = await f.outsider.client.get(`/api/workspaces/${own._id}/projects/${f.project._id}`);
    expect(res.status).toBe(404);
    expect((await f.outsider.client.get(f.projectPath)).status).toBe(403);
  });

  it("cascades a delete to the project's tasks, messages and notifications", async () => {
    const f = await createFixture(server.url);
    await f.owner.client.post(`${f.projectPath}/tasks`, { title: "Child", assignee: f.member.id });
    await Message.create({ project: f.project._id, sender: f.owner.id, text: "hi" });

    expect((await f.owner.client.delete(f.projectPath)).status).toBe(204);
    expect(await Task.countDocuments({ project: f.project._id })).toBe(0);
    expect(await Message.countDocuments({ project: f.project._id })).toBe(0);
    expect(await Notification.countDocuments({ project: f.project._id })).toBe(0);
  });
});

describe("tasks", () => {
  it("creates with defaults and lists newest first", async () => {
    const f = await createFixture(server.url);
    const a = await f.member.client.post(`${f.projectPath}/tasks`, { title: "First" });
    expect(a.status).toBe(201);
    expect(a.body.task).toMatchObject({ title: "First", status: "todo", project: f.project._id });

    const b = await f.member.client.post(`${f.projectPath}/tasks`, { title: "Second", status: "in_progress" });
    const list = await f.member.client.get(`${f.projectPath}/tasks`);
    expect(list.body.tasks.map((t: { _id: string }) => t._id)).toEqual([b.body.task._id, a.body.task._id]);
  });

  it("only accepts a current workspace member as assignee (400 otherwise)", async () => {
    const f = await createFixture(server.url);
    const ok = await f.owner.client.post(`${f.projectPath}/tasks`, { title: "Mine", assignee: f.member.id });
    expect(ok.status).toBe(201);
    expect(ok.body.task.assignee).toBe(f.member.id);

    const outsider = await f.owner.client.post(`${f.projectPath}/tasks`, { title: "No", assignee: f.outsider.id });
    expect(outsider.status).toBe(400);

    const reassign = await f.owner.client.patch(`${f.projectPath}/tasks/${ok.body.task._id}`, {
      assignee: f.outsider.id,
    });
    expect(reassign.status).toBe(400);
  });

  it("validates the body (400)", async () => {
    const f = await createFixture(server.url);
    const missingTitle = await f.owner.client.post(`${f.projectPath}/tasks`, {});
    expect(missingTitle.status).toBe(400);
    const badStatus = await f.owner.client.post(`${f.projectPath}/tasks`, { title: "x", status: "blocked" });
    expect(badStatus.status).toBe(400);
    expect(badStatus.body.issues[0].path).toBe("status");
  });

  it("updates only the fields sent — a title-only PATCH keeps the status", async () => {
    // Regression: the update schema used to be createTaskSchema.partial(),
    // whose `status` default ("todo") still applied, so renaming a task reset
    // its status.
    const f = await createFixture(server.url);
    const task = (await f.owner.client.post(`${f.projectPath}/tasks`, { title: "Draft", status: "done" })).body.task;

    const res = await f.owner.client.patch(`${f.projectPath}/tasks/${task._id}`, { title: "Final" });
    expect(res.status).toBe(200);
    expect(res.body.task).toMatchObject({ title: "Final", status: "done" });
    expect((await Task.findById(task._id))?.status).toBe("done");
  });

  it("returns 404 for a task looked up through another project", async () => {
    const f = await createFixture(server.url);
    const task = (await f.owner.client.post(`${f.projectPath}/tasks`, { title: "Here" })).body.task;
    const other = (await f.owner.client.post(`/api/workspaces/${f.workspace._id}/projects`, { name: "Other" })).body
      .project;
    const wrongPath = `/api/workspaces/${f.workspace._id}/projects/${other._id}/tasks/${task._id}`;
    expect((await f.owner.client.get(wrongPath)).status).toBe(404);
    expect((await f.owner.client.patch(wrongPath, { title: "Moved" })).status).toBe(404);
    expect((await f.owner.client.get(`${f.projectPath}/tasks/not-an-id`)).status).toBe(404);
  });

  it("deletes a task along with its notifications", async () => {
    const f = await createFixture(server.url);
    const task = (await f.owner.client.post(`${f.projectPath}/tasks`, { title: "Gone", assignee: f.member.id })).body
      .task;
    expect(await Notification.countDocuments({ task: task._id })).toBe(1);

    expect((await f.member.client.delete(`${f.projectPath}/tasks/${task._id}`)).status).toBe(204);
    expect((await f.member.client.get(`${f.projectPath}/tasks/${task._id}`)).status).toBe(404);
    expect(await Notification.countDocuments({ task: task._id })).toBe(0);
  });

  it("is closed to non-members (403) and needs CSRF for writes (403)", async () => {
    const f = await createFixture(server.url);
    expect((await f.outsider.client.get(`${f.projectPath}/tasks`)).status).toBe(403);
    expect((await f.outsider.client.post(`${f.projectPath}/tasks`, { title: "x" })).status).toBe(403);
    const noCsrf = await f.member.client.post(`${f.projectPath}/tasks`, { title: "x" }, { csrf: false });
    expect(noCsrf.status).toBe(403);
    expect(await Task.countDocuments()).toBe(0);
  });
});

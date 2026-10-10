import "dotenv/config";
import mongoose from "mongoose";
import { io as ioc, type Socket } from "socket.io-client";

const API = "http://localhost:4000";
const ORIGIN = "http://localhost:3000";
const ts = Date.now();
const A = { name: "S9 A", email: `s9test-a-${ts}@example.com`, password: "password123" };
const B = { name: "S9 B", email: `s9test-b-${ts}@example.com`, password: "password123" };

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra?: unknown): void {
  if (cond) {
    pass++;
    console.log(`  ok  ${name}`);
  } else {
    fail++;
    console.log(`FAIL  ${name}`, extra === undefined ? "" : extra);
  }
}

interface Creds {
  cookie: string;
  csrf: string;
}

async function req(
  path: string,
  opts: { method?: string; body?: unknown; creds?: Creds } = {},
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.creds) headers["Cookie"] = opts.creds.cookie;
  if (opts.creds) headers["X-CSRF-Token"] = opts.creds.csrf;
  return fetch(API + path, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

function credsFrom(res: Response): Creds {
  const pairs = res.headers.getSetCookie().map((c) => c.split(";")[0]!);
  const csrfPair = pairs.find((p) => p.startsWith("csrfToken="));
  return { cookie: pairs.join("; "), csrf: csrfPair ? decodeURIComponent(csrfPair.split("=")[1]!) : "" };
}

function connect(creds: Creds, origin: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = ioc(API, { autoConnect: true, extraHeaders: { Cookie: creds.cookie, Origin: origin } });
    const t = setTimeout(() => reject(new Error("connect timeout")), 8000);
    s.on("connect", () => {
      clearTimeout(t);
      resolve(s);
    });
    s.on("connect_error", (e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

function join(s: Socket, projectId: string): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => s.emit("project:join", { projectId }, resolve));
}

interface Ev {
  type: string;
  task?: any;
  payload?: any;
}

function record(s: Socket, into: Ev[]): void {
  s.on("task:created", (task) => into.push({ type: "created", task }));
  s.on("task:updated", (task) => into.push({ type: "updated", task }));
  s.on("task:deleted", (payload) => into.push({ type: "deleted", payload }));
}

function waitFor(evts: Ev[], pred: (e: Ev) => boolean, timeout = 5000): Promise<Ev> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const iv = setInterval(() => {
      const found = evts.find(pred);
      if (found) {
        clearInterval(iv);
        resolve(found);
      } else if (Date.now() - start > timeout) {
        clearInterval(iv);
        reject(new Error("timeout waiting for event"));
      }
    }, 40);
  });
}

async function main(): Promise<void> {
  // --- setup: two users, one workspace (both members), one project ---
  const ra = await req("/api/auth/register", { method: "POST", body: A });
  check("register A -> 201", ra.status === 201, ra.status);
  const ca = credsFrom(ra);

  const rb = await req("/api/auth/register", { method: "POST", body: B });
  check("register B -> 201", rb.status === 201, rb.status);
  const cb = credsFrom(rb);

  const rw = await req("/api/workspaces", {
    method: "POST",
    body: { name: `S9 WS ${ts}` },
    creds: ca,
  });
  check("create workspace -> 201", rw.status === 201, rw.status);
  const { workspace } = (await rw.json()) as { workspace: { _id: string } };

  const rm = await req(`/api/workspaces/${workspace._id}/members`, {
    method: "POST",
    body: { email: B.email },
    creds: ca,
  });
  check("add B as member -> 200", rm.status === 200, rm.status);

  const rp = await req(`/api/workspaces/${workspace._id}/projects`, {
    method: "POST",
    body: { name: `S9 Project ${ts}` },
    creds: ca,
  });
  check("create project -> 201", rp.status === 201, rp.status);
  const { project } = (await rp.json()) as { project: { _id: string } };

  // --- both members connect and join the project room ---
  const sA = await connect(ca, ORIGIN);
  const sB = await connect(cb, ORIGIN);
  check("A socket connected", sA.connected);
  check("B socket connected", sB.connected);

  const joinA = await join(sA, project._id);
  const joinB = await join(sB, project._id);
  check("A project:join ok", joinA.ok === true, joinA);
  check("B project:join ok", joinB.ok === true, joinB);

  const evB: Ev[] = [];
  const evA: Ev[] = [];
  record(sB, evB);
  record(sA, evA);

  const base = `/api/workspaces/${workspace._id}/projects/${project._id}/tasks`;

  // --- create ---
  const rc = await req(base, { method: "POST", body: { title: "Write the report" }, creds: ca });
  check("A create task -> 201", rc.status === 201, rc.status);
  const { task } = (await rc.json()) as { task: any };
  check("task REST shape (id/project/status/createdAt)", Boolean(task._id && task.project && task.status === "todo" && task.createdAt), task);

  const bCreated = await waitFor(evB, (e) => e.type === "created");
  check("B received task:created", bCreated.task?._id === task._id, bCreated.task);
  check(
    "task:created carries full task (same shape as REST)",
    bCreated.task?.title === "Write the report" &&
      bCreated.task?.project === project._id &&
      bCreated.task?.status === "todo" &&
      typeof bCreated.task?.createdAt === "string" &&
      bCreated.task?.__v === undefined,
    bCreated.task,
  );
  check("A (actor) also received its own task:created broadcast", evA.some((e) => e.type === "created" && e.task?._id === task._id));

  // --- update ---
  const ru = await req(`${base}/${task._id}`, { method: "PATCH", body: { status: "done" }, creds: ca });
  check("A update task -> 200", ru.status === 200, ru.status);
  const bUpdated = await waitFor(evB, (e) => e.type === "updated");
  check("B received task:updated with new status", bUpdated.task?._id === task._id && bUpdated.task?.status === "done", bUpdated.task);

  // --- delete ---
  const rd = await req(`${base}/${task._id}`, { method: "DELETE", creds: ca });
  check("A delete task -> 204", rd.status === 204, rd.status);
  const bDeleted = await waitFor(evB, (e) => e.type === "deleted");
  check("B received task:deleted with ids", bDeleted.payload?.taskId === task._id && bDeleted.payload?.projectId === project._id, bDeleted.payload);

  // --- outsider is NOT in the room: gets nothing ---
  const outsiderEvents: Ev[] = [];
  // (reuse B's creds but a fresh socket that never joins)
  const sOut = await connect(cb, ORIGIN);
  record(sOut, outsiderEvents);
  const rc2 = await req(base, { method: "POST", body: { title: "Second task" }, creds: ca });
  check("A create second task -> 201", rc2.status === 201, rc2.status);
  await new Promise((r) => setTimeout(r, 600));
  check("socket that never joined gets no task events", outsiderEvents.length === 0, outsiderEvents);

  // --- a foreign-Origin handshake is still rejected ---
  let foreignRejected = false;
  try {
    const sF = await connect(cb, "http://evil.example.com");
    sF.close();
  } catch {
    foreignRejected = true;
  }
  check("foreign-Origin handshake rejected", foreignRejected);

  sA.close();
  sB.close();
  sOut.close();

  // --- cleanup: delete workspace (cascades), then the two test users ---
  const rdel = await req(`/api/workspaces/${workspace._id}`, { method: "DELETE", creds: ca });
  check("delete workspace -> 204", rdel.status === 204, rdel.status);

  await mongoose.connect(process.env.MONGO_URI as string);
  const del = await mongoose.connection.db!.collection("users").deleteMany({ email: { $in: [A.email, B.email] } });
  console.log(`cleanup: removed ${del.deletedCount} test users`);
  await mongoose.disconnect();
}

main()
  .then(() => {
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail === 0 ? 0 : 1);
  })
  .catch(async (err) => {
    console.error("test run error:", err);
    await mongoose.disconnect().catch(() => {});
    process.exit(2);
  });

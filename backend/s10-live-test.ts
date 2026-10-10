import "dotenv/config";
import mongoose from "mongoose";
import { io as ioc, type Socket } from "socket.io-client";

const API = "http://localhost:4000";
const ORIGIN = "http://localhost:3000";
const ts = Date.now();
const A = { name: "S10 A", email: `s10test-a-${ts}@example.com`, password: "password123" };
const B = { name: "S10 B", email: `s10test-b-${ts}@example.com`, password: "password123" };
const C = { name: "S10 C", email: `s10test-c-${ts}@example.com`, password: "password123" };

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

async function req(path: string, opts: { method?: string; body?: unknown; creds?: Creds } = {}): Promise<Response> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.creds) {
    headers["Cookie"] = opts.creds.cookie;
    headers["X-CSRF-Token"] = opts.creds.csrf;
  }
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

function connect(creds: Creds): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = ioc(API, { autoConnect: true, extraHeaders: { Cookie: creds.cookie, Origin: ORIGIN } });
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

function waitFor<T>(arr: T[], pred: (x: T) => boolean, timeout = 6000): Promise<T> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const iv = setInterval(() => {
      const found = arr.find(pred);
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
  const ra = await req("/api/auth/register", { method: "POST", body: A });
  const rb = await req("/api/auth/register", { method: "POST", body: B });
  const rc = await req("/api/auth/register", { method: "POST", body: C });
  check("register A/B/C -> 201", ra.status === 201 && rb.status === 201 && rc.status === 201);
  const ca = credsFrom(ra);
  const cb = credsFrom(rb);
  const cc = credsFrom(rc);
  const bUserId = ((await rb.json()) as { user: { _id: string } }).user._id;

  const rw = await req("/api/workspaces", { method: "POST", body: { name: `S10 WS ${ts}` }, creds: ca });
  const { workspace } = (await rw.json()) as { workspace: { _id: string } };
  const rm = await req(`/api/workspaces/${workspace._id}/members`, { method: "POST", body: { email: B.email }, creds: ca });
  check("workspace created + B added", rw.status === 201 && rm.status === 200, [rw.status, rm.status]);

  const rp = await req(`/api/workspaces/${workspace._id}/projects`, { method: "POST", body: { name: `S10 Project ${ts}` }, creds: ca });
  const { project } = (await rp.json()) as { project: { _id: string } };

  // B and C connect but never join the project room — notifications must still reach B.
  const sA = await connect(ca);
  const sB = await connect(cb);
  const sC = await connect(cc);
  const notifsB: any[] = [];
  const notifsA: any[] = [];
  const notifsC: any[] = [];
  sA.on("notification:new", (n) => notifsA.push(n));
  sB.on("notification:new", (n) => notifsB.push(n));
  sC.on("notification:new", (n) => notifsC.push(n));

  const base = `/api/workspaces/${workspace._id}/projects/${project._id}/tasks`;

  // --- task assigned to B ---
  const rt = await req(base, { method: "POST", body: { title: "Write the report", assignee: bUserId }, creds: ca });
  check("A creates task assigned to B -> 201", rt.status === 201, rt.status);
  const { task } = (await rt.json()) as { task: any };

  const assigned = await waitFor(notifsB, (n) => n.type === "task_assigned");
  check(
    "B (not viewing project) got task_assigned with full DTO",
    assigned.actor?.name === "S10 A" &&
      assigned.preview === "Write the report" &&
      assigned.project === project._id &&
      assigned.workspace === workspace._id &&
      assigned.task === task._id &&
      assigned.read === false &&
      typeof assigned.createdAt === "string",
    assigned,
  );
  check("actor A gets no self-notification", notifsA.length === 0, notifsA);
  check("non-member C gets no notification", notifsC.length === 0, notifsC);

  // --- task updated (still assigned to B) ---
  await req(`${base}/${task._id}`, { method: "PATCH", body: { status: "done" }, creds: ca });
  const updated = await waitFor(notifsB, (n) => n.type === "task_updated");
  check("B got task_updated", updated.task === task._id && updated.preview === "Write the report", updated);

  // --- message in the project ---
  const sentText = "hello team, long enough to show as a preview";
  const ack = await new Promise<any>((resolve) => sA.emit("message:send", { projectId: project._id, text: sentText }, resolve));
  check("A message:send acked ok", ack.ok === true, ack);
  const msgNotif = await waitFor(notifsB, (n) => n.type === "message");
  check("B got message notification with sender + preview", msgNotif.actor?.name === "S10 A" && msgNotif.preview === sentText, msgNotif);
  check("actor A still has no self-notification", notifsA.length === 0, notifsA);
  check("non-member C still has none", notifsC.length === 0, notifsC);

  // --- REST list + unread count ---
  const listB = await req("/api/notifications", { creds: cb });
  const bodyB = (await listB.json()) as { notifications: any[]; unreadCount: number };
  check("GET /api/notifications B -> 200", listB.status === 200, listB.status);
  check("B unreadCount === 3", bodyB.unreadCount === 3, bodyB.unreadCount);
  check("B list newest-first (message, updated, assigned)", bodyB.notifications.map((n) => n.type).join(",") === "message,task_updated,task_assigned", bodyB.notifications.map((n) => n.type));

  const listA = await req("/api/notifications", { creds: ca });
  const bodyA = (await listA.json()) as { notifications: any[]; unreadCount: number };
  check("A has zero notifications", bodyA.unreadCount === 0 && bodyA.notifications.length === 0, bodyA);

  const noAuth = await req("/api/notifications");
  check("GET /api/notifications unauthenticated -> 401", noAuth.status === 401, noAuth.status);

  const noCsrf = await req("/api/notifications/read", { method: "POST", creds: { cookie: cb.cookie, csrf: "" } });
  check("POST read without CSRF -> 403", noCsrf.status === 403, noCsrf.status);

  const readRes = await req("/api/notifications/read", { method: "POST", creds: cb });
  check("POST /api/notifications/read -> 204", readRes.status === 204, readRes.status);

  const afterRead = await req("/api/notifications", { creds: cb });
  const bodyAfter = (await afterRead.json()) as { notifications: any[]; unreadCount: number };
  check("after mark-read: unreadCount 0 and all read", bodyAfter.unreadCount === 0 && bodyAfter.notifications.every((n) => n.read === true), bodyAfter);

  sA.close();
  sB.close();
  sC.close();

  const rdel = await req(`/api/workspaces/${workspace._id}`, { method: "DELETE", creds: ca });
  check("delete workspace -> 204", rdel.status === 204, rdel.status);

  await mongoose.connect(process.env.MONGO_URI as string);
  const notifLeft = await mongoose.connection.db!.collection("notifications").countDocuments({ workspace: new mongoose.Types.ObjectId(workspace._id) });
  check("workspace delete cascaded notifications", notifLeft === 0, notifLeft);
  const del = await mongoose.connection.db!.collection("users").deleteMany({ email: { $in: [A.email, B.email, C.email] } });
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

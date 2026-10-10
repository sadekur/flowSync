import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

const API = "http://localhost:4000";
const ts = Date.now();
const A = { name: "S10 UI A", email: `s10ui-a-${ts}@example.com`, password: "password123" };
const B = { name: "S10 UI B", email: `s10ui-b-${ts}@example.com`, password: "password123" };

interface Creds {
  cookie: string;
  csrf: string;
}

async function req(p: string, opts: { method?: string; body?: unknown; creds?: Creds } = {}): Promise<Response> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.creds) {
    headers["Cookie"] = opts.creds.cookie;
    headers["X-CSRF-Token"] = opts.creds.csrf;
  }
  return fetch(API + p, {
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

async function main(): Promise<void> {
  const ra = await req("/api/auth/register", { method: "POST", body: A });
  const ca = credsFrom(ra);
  const rb = await req("/api/auth/register", { method: "POST", body: B });
  const { user: bUser } = (await rb.json()) as { user: { _id: string } };

  const rw = await req("/api/workspaces", { method: "POST", body: { name: `S10 UI WS ${ts}` }, creds: ca });
  const { workspace } = (await rw.json()) as { workspace: { _id: string } };
  await req(`/api/workspaces/${workspace._id}/members`, { method: "POST", body: { email: B.email }, creds: ca });
  const rp = await req(`/api/workspaces/${workspace._id}/projects`, { method: "POST", body: { name: `S10 UI Project ${ts}` }, creds: ca });
  const { project } = (await rp.json()) as { project: { _id: string } };
  await req(`/api/workspaces/${workspace._id}/projects/${project._id}/tasks`, {
    method: "POST",
    body: { title: "Prepare the demo", assignee: bUser._id },
    creds: ca,
  });

  const out = {
    aEmail: A.email,
    aPassword: A.password,
    bEmail: B.email,
    bPassword: B.password,
    workspaceId: workspace._id,
    projectId: project._id,
    mark: ts,
  };
  fs.writeFileSync(path.join(process.env.COMMANDCODE_SCRATCHPAD as string, "s10-ui.json"), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import { config as loadEnv } from "dotenv";
import fs from "node:fs";

loadEnv({ quiet: true });

const API = "http://localhost:4000";
const suffix = Date.now().toString(36);
const state = { suffix, users: {}, api: API, out: process.argv[2] ?? "/tmp/s8browser-state.json" };

function makeJar() {
  const jar = { values: {} };
  jar.header = () => Object.entries(jar.values).map(([k, v]) => `${k}=${v}`).join("; ");
  jar.absorb = (res) => {
    for (const h of res.headers.getSetCookie?.() ?? []) {
      const pair = h.split(";")[0];
      const eq = pair.indexOf("=");
      jar.values[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
    }
  };
  return jar;
}

async function api(jar, method, path, body) {
  const headers = { "Content-Type": "application/json" };
  if (Object.keys(jar.values).length) headers.Cookie = jar.header();
  if (method !== "GET" && jar.values.csrfToken) headers["X-CSRF-Token"] = jar.values.csrfToken;
  const res = await fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  jar.absorb(res);
  return res;
}

const jarA = makeJar();
const jarB = makeJar();
const password = "s8browser-Pass-123!";

const mkUser = (letter) => ({
  name: `Browser ${letter}`,
  email: `s8browser-${letter.toLowerCase()}-${suffix}@example.com`,
  password,
});

const regA = await api(jarA, "POST", "/api/auth/register", mkUser("A"));
const regB = await api(jarB, "POST", "/api/auth/register", mkUser("B"));
if (regA.status !== 201 || regB.status !== 201) {
  console.error("register failed", regA.status, regB.status, await regA.text(), await regB.text());
  process.exit(1);
}

const wsRes = await api(jarA, "POST", "/api/workspaces", { name: `s8browser-ws-${suffix}` });
const workspace = (await wsRes.json()).workspace;
const memberRes = await api(jarA, "POST", `/api/workspaces/${workspace._id}/members`, { email: mkUser("B").email });
if (memberRes.status !== 200 && memberRes.status !== 201) {
  console.error("add member failed", memberRes.status, await memberRes.text());
  process.exit(1);
}
const projRes = await api(jarA, "POST", `/api/workspaces/${workspace._id}/projects`, { name: "s8browser-proj" });
const project = (await projRes.json()).project;

Object.assign(state, {
  users: {
    A: { name: mkUser("A").name, email: mkUser("A").email, password },
    B: { name: mkUser("B").name, email: mkUser("B").email, password },
  },
  workspaceId: workspace._id,
  workspaceSlug: workspace.slug,
  projectId: project._id,
  projectSlug: project.slug,
  jarA: jarA.values,
  jarB: jarB.values,
  projectUrl: `/projects/${project.slug}?workspace=${workspace.slug}`,
});

fs.writeFileSync(state.out, JSON.stringify(state, null, 2));
console.log(`projectUrl: ${state.projectUrl}`);
console.log(`A: ${mkUser("A").email} / ${password}`);
console.log(`B: ${mkUser("B").email} / ${password}`);
console.log(`state saved to ${state.out}`);

// A minimal browser stand-in for REST calls: keeps its own cookie jar and,
// like src/lib/client-api.ts, echoes the csrfToken cookie as X-CSRF-Token on
// every non-GET. Cookies are handled by hand because the API scopes them to
// COOKIE_DOMAIN=localhost while the test server listens on 127.0.0.1.

export interface ApiResponse<T = any> {
  status: number;
  body: T;
  headers: Headers;
  /** Raw Set-Cookie headers, for asserting cookie flags. */
  setCookies: string[];
}

interface RequestOptions {
  body?: unknown;
  /** Send the X-CSRF-Token header on a mutation (default true). */
  csrf?: boolean;
  headers?: Record<string, string>;
}

let emailCounter = 0;

export class TestClient {
  readonly cookies = new Map<string, string>();

  constructor(readonly baseUrl: string) {}

  get cookieHeader(): string {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  async request<T = any>(method: string, path: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = { ...options.headers };
    if (this.cookies.size > 0) headers.cookie = this.cookieHeader;
    if (options.body !== undefined) headers["content-type"] = "application/json";
    const csrfToken = this.cookies.get("csrfToken");
    if (method !== "GET" && options.csrf !== false && csrfToken) headers["x-csrf-token"] = csrfToken;

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });

    const setCookies = res.headers.getSetCookie();
    for (const raw of setCookies) {
      const [pair = ""] = raw.split(";");
      const eq = pair.indexOf("=");
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      // clearCookie sends an empty value with an expiry in the past.
      if (value === "" || /expires=Thu, 01 Jan 1970/i.test(raw)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }

    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : undefined, headers: res.headers, setCookies };
  }

  get<T = any>(path: string, options?: RequestOptions) {
    return this.request<T>("GET", path, options);
  }
  post<T = any>(path: string, body?: unknown, options?: RequestOptions) {
    return this.request<T>("POST", path, { ...options, body });
  }
  patch<T = any>(path: string, body?: unknown, options?: RequestOptions) {
    return this.request<T>("PATCH", path, { ...options, body });
  }
  delete<T = any>(path: string, options?: RequestOptions) {
    return this.request<T>("DELETE", path, options);
  }
}

export interface TestUser {
  client: TestClient;
  id: string;
  name: string;
  email: string;
  password: string;
}

/** Registers a fresh user (unique email per call) and returns a logged-in client. */
export async function registerUser(baseUrl: string, name = "user"): Promise<TestUser> {
  const client = new TestClient(baseUrl);
  const email = `${name.toLowerCase()}-${++emailCounter}-${Date.now()}@example.com`;
  const password = "password123";
  const res = await client.post("/api/auth/register", { name, email, password });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { client, id: res.body.user._id ?? res.body.user.id, name, email, password };
}

export interface Fixture {
  owner: TestUser;
  member: TestUser;
  outsider: TestUser;
  workspace: { _id: string; slug: string };
  project: { _id: string; slug: string };
  /** `/api/workspaces/:id/projects/:id` */
  projectPath: string;
}

/**
 * The common shape for most tests: an owner and a second member sharing one
 * workspace with one project, plus an outsider who belongs to neither.
 */
export async function createFixture(baseUrl: string): Promise<Fixture> {
  const [owner, member, outsider] = await Promise.all([
    registerUser(baseUrl, "Owner"),
    registerUser(baseUrl, "Member"),
    registerUser(baseUrl, "Outsider"),
  ]);

  const ws = await owner.client.post("/api/workspaces", { name: "Test Workspace" });
  if (ws.status !== 201) throw new Error(`workspace create failed: ${ws.status}`);
  const workspace = ws.body.workspace;

  const add = await owner.client.post(`/api/workspaces/${workspace._id}/members`, { email: member.email });
  if (add.status !== 200) throw new Error(`add member failed: ${add.status}`);

  const pr = await owner.client.post(`/api/workspaces/${workspace._id}/projects`, { name: "Test Project" });
  if (pr.status !== 201) throw new Error(`project create failed: ${pr.status}`);
  const project = pr.body.project;

  return {
    owner,
    member,
    outsider,
    workspace,
    project,
    projectPath: `/api/workspaces/${workspace._id}/projects/${project._id}`,
  };
}

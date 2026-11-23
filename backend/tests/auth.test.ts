import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startTestServer, resetData, type TestServer } from "./helpers/server";
import { registerUser, TestClient } from "./helpers/api";

let server: TestServer;

beforeAll(async () => {
  server = await startTestServer();
});
afterAll(async () => {
  await server.close();
});
beforeEach(resetData);

function cookieFlags(setCookies: string[], name: string): string {
  const raw = setCookies.find((c) => c.startsWith(`${name}=`));
  if (!raw) throw new Error(`no Set-Cookie for ${name}`);
  return raw;
}

describe("POST /api/auth/register", () => {
  it("creates the user, sets the three auth cookies and never returns a token", async () => {
    const client = new TestClient(server.url);
    const res = await client.post("/api/auth/register", {
      name: "Alice",
      email: "Alice@Example.com",
      password: "password123",
    });

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ name: "Alice", email: "alice@example.com" });
    expect(JSON.stringify(res.body)).not.toMatch(/password|accessToken|refreshToken|csrfToken/i);

    const access = cookieFlags(res.setCookies, "accessToken");
    const refresh = cookieFlags(res.setCookies, "refreshToken");
    const csrf = cookieFlags(res.setCookies, "csrfToken");
    for (const cookie of [access, refresh, csrf]) {
      expect(cookie).toMatch(/SameSite=Strict/i);
      expect(cookie).toMatch(/Domain=localhost/i);
    }
    expect(access).toMatch(/HttpOnly/i);
    expect(refresh).toMatch(/HttpOnly/i);
    // The client must be able to read it to echo it back (double-submit).
    expect(csrf).not.toMatch(/HttpOnly/i);
  });

  it("rejects a duplicate email with 409", async () => {
    const alice = await registerUser(server.url, "Alice");
    const res = await new TestClient(server.url).post("/api/auth/register", {
      name: "Other",
      email: alice.email.toUpperCase(),
      password: "password123",
    });
    expect(res.status).toBe(409);
  });

  it("rejects invalid input with 400 and per-field issues", async () => {
    const res = await new TestClient(server.url).post("/api/auth/register", {
      name: "",
      email: "not-an-email",
      password: "short",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
    const paths = res.body.issues.map((i: { path: string }) => i.path);
    expect(paths).toEqual(expect.arrayContaining(["name", "email", "password"]));
  });
});

describe("POST /api/auth/login", () => {
  it("logs in with the right password", async () => {
    const alice = await registerUser(server.url, "Alice");
    const client = new TestClient(server.url);
    const res = await client.post("/api/auth/login", { email: alice.email, password: alice.password });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(alice.email);
    expect(client.cookies.has("accessToken")).toBe(true);
  });

  it("answers a wrong password and an unknown email the same way (401)", async () => {
    const alice = await registerUser(server.url, "Alice");
    const wrong = await new TestClient(server.url).post("/api/auth/login", {
      email: alice.email,
      password: "wrong-password",
    });
    const unknown = await new TestClient(server.url).post("/api/auth/login", {
      email: "nobody@example.com",
      password: "password123",
    });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error).toBe(unknown.body.error);
  });
});

describe("GET /api/auth/me", () => {
  it("returns the profile for a valid access cookie", async () => {
    const alice = await registerUser(server.url, "Alice");
    const res = await alice.client.get("/api/auth/me");
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(alice.email);
    expect(res.body.user).not.toHaveProperty("password");
    expect(res.body.user).not.toHaveProperty("passwordHash");
  });

  it("rejects a missing or tampered access token with 401", async () => {
    expect((await new TestClient(server.url).get("/api/auth/me")).status).toBe(401);

    const alice = await registerUser(server.url, "Alice");
    const token = alice.client.cookies.get("accessToken")!;
    alice.client.cookies.set("accessToken", `${token.slice(0, -2)}xx`);
    expect((await alice.client.get("/api/auth/me")).status).toBe(401);
  });
});

describe("POST /api/auth/refresh", () => {
  it("requires the CSRF header (403)", async () => {
    const alice = await registerUser(server.url, "Alice");
    expect((await alice.client.post("/api/auth/refresh", undefined, { csrf: false })).status).toBe(403);
    // A header that doesn't match the cookie is just as bad as none.
    const mismatched = await alice.client.post("/api/auth/refresh", undefined, {
      csrf: false,
      headers: { "x-csrf-token": "forged" },
    });
    expect(mismatched.status).toBe(403);
  });

  it("rotates the cookies and keeps the session working", async () => {
    const alice = await registerUser(server.url, "Alice");
    const oldCsrf = alice.client.cookies.get("csrfToken");

    const res = await alice.client.post("/api/auth/refresh");
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(alice.email);
    expect(alice.client.cookies.get("csrfToken")).not.toBe(oldCsrf);
    expect((await alice.client.get("/api/auth/me")).status).toBe(200);
  });

  it("rejects an invalid refresh token with 401", async () => {
    const alice = await registerUser(server.url, "Alice");
    alice.client.cookies.set("refreshToken", "garbage");
    expect((await alice.client.post("/api/auth/refresh")).status).toBe(401);
  });
});

describe("POST /api/auth/logout", () => {
  it("requires the CSRF header (403)", async () => {
    const alice = await registerUser(server.url, "Alice");
    expect((await alice.client.post("/api/auth/logout", undefined, { csrf: false })).status).toBe(403);
  });

  it("clears all three cookies", async () => {
    const alice = await registerUser(server.url, "Alice");
    const res = await alice.client.post("/api/auth/logout");
    expect(res.status).toBe(204);
    expect(alice.client.cookies.size).toBe(0);
    expect((await alice.client.get("/api/auth/me")).status).toBe(401);
  });
});

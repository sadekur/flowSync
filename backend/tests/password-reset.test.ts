import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { startTestServer, resetData, type TestServer } from "./helpers/server";
import { registerUser, TestClient, type TestUser } from "./helpers/api";
import { testOutbox } from "../src/utils/mailer";
import { AuthToken } from "../src/models/AuthToken";

let server: TestServer;

beforeAll(async () => {
  server = await startTestServer();
});
afterAll(async () => {
  await server.close();
});
beforeEach(resetData);

const GENERIC = "If an account exists for that email, a reset link is on its way.";

function anonymous(): TestClient {
  return new TestClient(server.url);
}

async function requestReset(email: string) {
  return anonymous().post("/api/auth/forgot-password", { email });
}

/** The token from the newest reset email sent to `email`. */
function tokenFromOutbox(email: string): string {
  const mail = testOutbox.filter((m) => m.to === email).at(-1);
  if (!mail) throw new Error(`no email sent to ${email}`);
  const match = mail.text.match(/http:\/\/localhost:3000\/reset-password#token=([A-Za-z0-9_-]+)/);
  if (!match?.[1]) throw new Error("no reset link in the email");
  return match[1];
}

async function login(user: TestUser, password: string) {
  return anonymous().post("/api/auth/login", { email: user.email, password });
}

describe("POST /api/auth/forgot-password", () => {
  it("emails a reset link (token in the URL fragment) and stores only its hash", async () => {
    const alice = await registerUser(server.url, "Alice");
    const res = await requestReset(alice.email.toUpperCase());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: GENERIC });
    expect(testOutbox).toHaveLength(1);
    expect(testOutbox[0]).toMatchObject({ to: alice.email, subject: "Reset your FlowSync password" });
    expect(testOutbox[0]?.html).toContain("/reset-password#token=");

    const token = tokenFromOutbox(alice.email);
    const stored = await AuthToken.find({}).lean();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.tokenHash).not.toBe(token);
    expect(JSON.stringify(stored)).not.toContain(token);
  });

  it("answers the same for an unknown email, and sends nothing", async () => {
    const res = await requestReset("nobody@example.com");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: GENERIC });
    expect(testOutbox).toHaveLength(0);
  });

  it("rate-limits per email, before looking the account up", async () => {
    const alice = await registerUser(server.url, "Alice");
    for (let i = 0; i < 3; i++) expect((await requestReset(alice.email)).status).toBe(200);
    expect((await requestReset(alice.email)).status).toBe(429);
    // An unknown address hits the same limit, so a 429 reveals nothing.
    for (let i = 0; i < 3; i++) await requestReset("nobody@example.com");
    expect((await requestReset("nobody@example.com")).status).toBe(429);
  });

  it("rejects an invalid email with 400", async () => {
    const res = await requestReset("not-an-email");
    expect(res.status).toBe(400);
    expect(res.body.issues[0].path).toBe("email");
  });
});

describe("POST /api/auth/reset-password", () => {
  it("sets the new password, works once, and signs out existing sessions", async () => {
    const alice = await registerUser(server.url, "Alice");
    await requestReset(alice.email);
    const token = tokenFromOutbox(alice.email);

    // Alice's other session (another device), from before the reset.
    const otherDevice = (await login(alice, alice.password)).status === 200 ? new TestClient(server.url) : null;
    await otherDevice?.post("/api/auth/login", { email: alice.email, password: alice.password });

    // Reset from the browser she's logged in on: its cookies are cleared.
    const res = await alice.client.post("/api/auth/reset-password", { token, password: "brand-new-pass" });
    expect(res.status).toBe(200);
    expect(res.setCookies.some((c) => c.startsWith("refreshToken=;"))).toBe(true);

    expect((await login(alice, alice.password)).status).toBe(401);
    expect((await login(alice, "brand-new-pass")).status).toBe(200);

    // Her other session can no longer refresh.
    expect((await otherDevice!.post("/api/auth/refresh")).status).toBe(401);

    // Single use.
    const again = await anonymous().post("/api/auth/reset-password", { token, password: "another-pass-1" });
    expect(again.status).toBe(400);
    expect(again.body.error).toMatch(/invalid or has expired/);
  });

  it("leaves a different account's session in the same browser alone", async () => {
    const alice = await registerUser(server.url, "Alice");
    const bob = await registerUser(server.url, "Bob");
    await requestReset(alice.email);

    // Bob's browser opens Alice's link (a shared machine).
    const res = await bob.client.post("/api/auth/reset-password", { token: tokenFromOutbox(alice.email), password: "brand-new-pass" });
    expect(res.status).toBe(200);
    expect(res.setCookies).toHaveLength(0);
    expect((await bob.client.get("/api/auth/me")).body.user.email).toBe(bob.email);
    expect((await bob.client.post("/api/auth/refresh")).status).toBe(200);
  });

  it("only the newest link works", async () => {
    const alice = await registerUser(server.url, "Alice");
    await requestReset(alice.email);
    const first = tokenFromOutbox(alice.email);
    await requestReset(alice.email);
    const second = tokenFromOutbox(alice.email);

    expect((await anonymous().post("/api/auth/reset-password", { token: first, password: "brand-new-pass" })).status).toBe(400);
    expect((await anonymous().post("/api/auth/reset-password", { token: second, password: "brand-new-pass" })).status).toBe(200);
  });

  it("refuses an expired link", async () => {
    const alice = await registerUser(server.url, "Alice");
    await requestReset(alice.email);
    const token = tokenFromOutbox(alice.email);
    await AuthToken.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });

    const res = await anonymous().post("/api/auth/reset-password", { token, password: "brand-new-pass" });
    expect(res.status).toBe(400);
    expect((await login(alice, alice.password)).status).toBe(200);
  });

  it("refuses a made-up token and a short password", async () => {
    const alice = await registerUser(server.url, "Alice");
    await requestReset(alice.email);
    const token = tokenFromOutbox(alice.email);

    expect((await anonymous().post("/api/auth/reset-password", { token: "made-up", password: "brand-new-pass" })).status).toBe(400);
    const short = await anonymous().post("/api/auth/reset-password", { token, password: "short" });
    expect(short.status).toBe(400);
    expect(short.body.issues[0].path).toBe("password");
    // A validation failure doesn't use the link up.
    expect((await anonymous().post("/api/auth/reset-password", { token, password: "brand-new-pass" })).status).toBe(200);
  });

  it("has a TTL index so MongoDB deletes expired tokens itself", async () => {
    const indexes = await mongoose.connection.collection("authtokens").indexes();
    expect(indexes.find((i) => i.key.expiresAt === 1)?.expireAfterSeconds).toBe(0);
  });
});

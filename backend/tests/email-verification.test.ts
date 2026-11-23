import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startTestServer, resetData, type TestServer } from "./helpers/server";
import { registerUser, TestClient, type TestUser } from "./helpers/api";
import { testOutbox } from "../src/utils/mailer";
import { AuthToken } from "../src/models/AuthToken";
import { User } from "../src/models/User";

let server: TestServer;

beforeAll(async () => {
  server = await startTestServer();
});
afterAll(async () => {
  await server.close();
});
beforeEach(resetData);

const SUBJECT = "Confirm your FlowSync email address";

function anonymous(): TestClient {
  return new TestClient(server.url);
}

function verificationEmails(email: string) {
  return testOutbox.filter((m) => m.to === email && m.subject === SUBJECT);
}

/** The token from the newest verification email sent to `email`. */
function tokenFromOutbox(email: string): string {
  const mail = verificationEmails(email).at(-1);
  if (!mail) throw new Error(`no verification email sent to ${email}`);
  const match = mail.text.match(/http:\/\/localhost:3000\/verify-email#token=([A-Za-z0-9_-]+)/);
  if (!match?.[1]) throw new Error("no verification link in the email");
  return match[1];
}

async function verifiedAt(user: TestUser): Promise<string | null> {
  return (await user.client.get("/api/auth/me")).body.user.emailVerifiedAt;
}

async function verify(token: string) {
  return anonymous().post("/api/auth/verify-email", { token });
}

describe("registration", () => {
  it("emails a verification link (token in the fragment) and starts unverified", async () => {
    const alice = await registerUser(server.url, "Alice");

    expect(verificationEmails(alice.email)).toHaveLength(1);
    expect(verificationEmails(alice.email)[0]?.html).toContain("/verify-email#token=");
    expect(await verifiedAt(alice)).toBeNull();

    const token = tokenFromOutbox(alice.email);
    const stored = await AuthToken.find({ purpose: "email_verification" }).lean();
    expect(stored).toHaveLength(1);
    expect(JSON.stringify(stored)).not.toContain(token);
    // An unverified account isn't locked out of anything.
    expect((await alice.client.post("/api/workspaces", { name: "Still allowed" })).status).toBe(201);
  });
});

describe("POST /api/auth/verify-email", () => {
  it("verifies from any browser, works once, and keeps the first time", async () => {
    const alice = await registerUser(server.url, "Alice");
    const token = tokenFromOutbox(alice.email);

    const res = await verify(token);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "Email verified." });
    const first = await verifiedAt(alice);
    expect(first).not.toBeNull();

    const again = await verify(token);
    expect(again.status).toBe(400);
    expect(again.body.error).toMatch(/invalid or has expired/);
    expect(await verifiedAt(alice)).toBe(first);
  });

  it("refuses an expired link, a made-up token, and a missing one", async () => {
    const alice = await registerUser(server.url, "Alice");
    const token = tokenFromOutbox(alice.email);
    await AuthToken.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });

    expect((await verify(token)).status).toBe(400);
    expect((await verify("made-up")).status).toBe(400);
    const missing = await anonymous().post("/api/auth/verify-email", {});
    expect(missing.status).toBe(400);
    expect(missing.body.issues[0].path).toBe("token");
    expect(await verifiedAt(alice)).toBeNull();
  });

  it("won't redeem a token mailed for a different purpose, either way round", async () => {
    const alice = await registerUser(server.url, "Alice");
    const verifyToken = tokenFromOutbox(alice.email);
    await anonymous().post("/api/auth/forgot-password", { email: alice.email });
    const resetMail = testOutbox.filter((m) => m.subject === "Reset your FlowSync password").at(-1);
    const resetToken = resetMail?.text.match(/#token=([A-Za-z0-9_-]+)/)?.[1] ?? "";

    expect((await verify(resetToken)).status).toBe(400);
    const res = await anonymous().post("/api/auth/reset-password", { token: verifyToken, password: "brand-new-pass" });
    expect(res.status).toBe(400);
    expect((await anonymous().post("/api/auth/login", { email: alice.email, password: alice.password })).status).toBe(200);
  });
});

describe("POST /api/auth/resend-verification", () => {
  it("needs a session and the CSRF header", async () => {
    expect((await anonymous().post("/api/auth/resend-verification")).status).toBe(401);
    const alice = await registerUser(server.url, "Alice");
    expect((await alice.client.post("/api/auth/resend-verification", undefined, { csrf: false })).status).toBe(403);
  });

  it("sends a new link and retires the old one", async () => {
    const alice = await registerUser(server.url, "Alice");
    const first = tokenFromOutbox(alice.email);

    const res = await alice.client.post("/api/auth/resend-verification");
    expect(res.status).toBe(200);
    expect(verificationEmails(alice.email)).toHaveLength(2);
    const second = tokenFromOutbox(alice.email);

    expect((await verify(first)).status).toBe(400);
    expect((await verify(second)).status).toBe(200);
  });

  it("rate-limits per user", async () => {
    const alice = await registerUser(server.url, "Alice");
    for (let i = 0; i < 3; i++) expect((await alice.client.post("/api/auth/resend-verification")).status).toBe(200);
    const limited = await alice.client.post("/api/auth/resend-verification");
    expect(limited.status).toBe(429);
    expect(verificationEmails(alice.email)).toHaveLength(4); // registration + 3 resends

    // Someone else's limit is their own.
    const bob = await registerUser(server.url, "Bob");
    expect((await bob.client.post("/api/auth/resend-verification")).status).toBe(200);
  });

  it("refuses once the email is verified", async () => {
    const alice = await registerUser(server.url, "Alice");
    await verify(tokenFromOutbox(alice.email));

    const res = await alice.client.post("/api/auth/resend-verification");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Your email is already verified.");
    expect(verificationEmails(alice.email)).toHaveLength(1);
  });
});

describe("password reset", () => {
  it("also verifies the email, since the link reached the inbox", async () => {
    const alice = await registerUser(server.url, "Alice");
    await anonymous().post("/api/auth/forgot-password", { email: alice.email });
    const resetMail = testOutbox.filter((m) => m.subject === "Reset your FlowSync password").at(-1);
    const token = resetMail?.text.match(/#token=([A-Za-z0-9_-]+)/)?.[1] ?? "";

    expect((await anonymous().post("/api/auth/reset-password", { token, password: "brand-new-pass" })).status).toBe(200);
    const user = await User.findById(alice.id).lean();
    expect(user?.emailVerifiedAt).toBeInstanceOf(Date);
  });
});

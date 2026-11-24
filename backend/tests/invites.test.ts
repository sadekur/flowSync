import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startTestServer, resetData, type TestServer } from "./helpers/server";
import { markVerified, registerUser, TestClient, type TestUser } from "./helpers/api";
import { testMailControl, testOutbox } from "../src/utils/mailer";
import { WorkspaceInvite } from "../src/models/WorkspaceInvite";

let server: TestServer;

beforeAll(async () => {
  server = await startTestServer();
});
afterAll(async () => {
  await server.close();
});
beforeEach(resetData);

function anonymous(): TestClient {
  return new TestClient(server.url);
}

let emailCounter = 0;
function freshEmail(): string {
  return `invitee-${++emailCounter}-${Date.now()}@example.com`;
}

/** An owner with one workspace. */
async function ownerWithWorkspace() {
  const owner = await registerUser(server.url, "Owner");
  const ws = (await owner.client.post("/api/workspaces", { name: "Design Team" })).body.workspace;
  return { owner, ws, membersPath: `/api/workspaces/${ws._id}/members`, invitesPath: `/api/workspaces/${ws._id}/invites` };
}

function invitesTo(email: string) {
  return testOutbox.filter((m) => m.to === email && m.subject.includes("invited you"));
}

/** The token from the newest invite email sent to `email`. */
function inviteToken(email: string): string {
  const mail = invitesTo(email).at(-1);
  if (!mail) throw new Error(`no invite email sent to ${email}`);
  const match = mail.text.match(/http:\/\/localhost:3000\/invite#token=([A-Za-z0-9_-]+)/);
  if (!match?.[1]) throw new Error("no invite link in the email");
  return match[1];
}

async function memberIds(owner: TestUser, wsId: string): Promise<string[]> {
  const res = await owner.client.get(`/api/workspaces/${wsId}`);
  return res.body.workspace.members.map((m: { _id: string }) => m._id).sort();
}

/** Registers through an invite link, the way the /invite page does. */
async function registerWithInvite(email: string, token: string) {
  const client = anonymous();
  const res = await client.post("/api/auth/register", { name: "Newcomer", email, password: "password123", inviteToken: token });
  return { client, res };
}

describe("POST /api/workspaces/:id/members", () => {
  it("adds a verified account at once and emails them that they were added", async () => {
    const { owner, ws, membersPath } = await ownerWithWorkspace();
    const bob = await registerUser(server.url, "Bob");
    await markVerified(bob);

    const res = await owner.client.post(membersPath, { email: bob.email });
    expect(res.status).toBe(200);
    expect(await memberIds(owner, ws._id)).toEqual([owner.id, bob.id].sort());

    const added = testOutbox.filter((m) => m.to === bob.email && m.subject.includes("added you"));
    expect(added).toHaveLength(1);
    expect(added[0]?.text).toContain('"Design Team"');
    expect(added[0]?.text).toContain("http://localhost:3000/dashboard");
    expect(await WorkspaceInvite.countDocuments()).toBe(0);
  });

  it("emails an invite link to an address with no account, storing only the token's hash", async () => {
    const { owner, ws, membersPath, invitesPath } = await ownerWithWorkspace();
    const email = freshEmail();

    const res = await owner.client.post(membersPath, { email: email.toUpperCase() });
    expect(res.status).toBe(201);
    expect(res.body.invite).toMatchObject({ email, invitedBy: owner.id });
    expect(await memberIds(owner, ws._id)).toEqual([owner.id]);

    const token = inviteToken(email);
    expect(invitesTo(email)[0]?.html).toContain("/invite#token=");
    const stored = await WorkspaceInvite.find().lean();
    expect(stored).toHaveLength(1);
    expect(JSON.stringify(stored)).not.toContain(token);

    const list = await owner.client.get(invitesPath);
    expect(list.status).toBe(200);
    expect(list.body.invites.map((i: { email: string }) => i.email)).toEqual([email]);
  });

  it("invites an unverified account instead of adding it: whoever registered it may not own the address", async () => {
    const { owner, ws, membersPath } = await ownerWithWorkspace();
    const squatter = await registerUser(server.url, "Squatter");

    const res = await owner.client.post(membersPath, { email: squatter.email });
    expect(res.status).toBe(201);
    expect(await memberIds(owner, ws._id)).toEqual([owner.id]);
    expect(invitesTo(squatter.email)).toHaveLength(1);
  });

  it("inviting again resends with a new link and retires the old one", async () => {
    const { owner, membersPath } = await ownerWithWorkspace();
    const email = freshEmail();
    await owner.client.post(membersPath, { email });
    const first = inviteToken(email);
    expect((await owner.client.post(membersPath, { email })).status).toBe(201);
    const second = inviteToken(email);

    expect(second).not.toBe(first);
    expect(await WorkspaceInvite.countDocuments()).toBe(1);
    expect((await anonymous().post("/api/invites/lookup", { token: first })).status).toBe(400);
    expect((await anonymous().post("/api/invites/lookup", { token: second })).status).toBe(200);
  });

  it("answers 503 and keeps no pending invite when the email can't be sent", async () => {
    const { owner, membersPath, invitesPath } = await ownerWithWorkspace();
    testMailControl.failNext = 1;

    expect((await owner.client.post(membersPath, { email: freshEmail() })).status).toBe(503);
    expect((await owner.client.get(invitesPath)).body.invites).toEqual([]);
  });

  it("limits each owner to 20 adds or invites an hour", async () => {
    const { owner, membersPath } = await ownerWithWorkspace();
    for (let i = 0; i < 20; i++) {
      expect((await owner.client.post(membersPath, { email: freshEmail() })).status).toBe(201);
    }
    expect((await owner.client.post(membersPath, { email: freshEmail() })).status).toBe(429);
  });
});

describe("POST /api/invites/lookup", () => {
  it("shows the invite to whoever holds the link, without a session, and changes nothing", async () => {
    const { owner, membersPath } = await ownerWithWorkspace();
    const email = freshEmail();
    await owner.client.post(membersPath, { email });

    const res = await anonymous().post("/api/invites/lookup", { token: inviteToken(email) });
    expect(res.status).toBe(200);
    expect(res.body.invite).toMatchObject({ email, workspaceName: "Design Team", invitedByName: "Owner" });
    expect(await WorkspaceInvite.countDocuments()).toBe(1);
  });

  it("rejects a made-up, missing or expired token (400)", async () => {
    const { owner, membersPath } = await ownerWithWorkspace();
    const email = freshEmail();
    await owner.client.post(membersPath, { email });
    await WorkspaceInvite.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });

    expect((await anonymous().post("/api/invites/lookup", { token: inviteToken(email) })).status).toBe(400);
    expect((await anonymous().post("/api/invites/lookup", { token: "made-up" })).status).toBe(400);
    expect((await anonymous().post("/api/invites/lookup", {})).status).toBe(400);
  });
});

describe("registering through an invite", () => {
  it("joins the workspace, verifies the address and sends no verification email", async () => {
    const { owner, ws, membersPath } = await ownerWithWorkspace();
    const email = freshEmail();
    await owner.client.post(membersPath, { email });
    // Cache the owner's list (and its member count) before the join.
    expect((await owner.client.get("/api/workspaces")).body.workspaces[0].members).toHaveLength(1);

    const { client, res } = await registerWithInvite(email, inviteToken(email));
    expect(res.status).toBe(201);
    expect(res.body.workspace).toMatchObject({ _id: ws._id, name: "Design Team", slug: ws.slug });
    expect(res.body.inviteError).toBeNull();
    expect(res.body.user.emailVerifiedAt).not.toBeNull();
    expect(testOutbox.filter((m) => m.to === email && m.subject.startsWith("Confirm"))).toHaveLength(0);

    expect((await client.get("/api/workspaces")).body.workspaces.map((w: { _id: string }) => w._id)).toEqual([ws._id]);
    expect((await owner.client.get("/api/workspaces")).body.workspaces[0].members).toHaveLength(2);
    expect(await WorkspaceInvite.countDocuments()).toBe(0);
  });

  it("still creates the account when the invite doesn't work, and says why", async () => {
    const { owner, membersPath } = await ownerWithWorkspace();
    const invited = freshEmail();
    await owner.client.post(membersPath, { email: invited });

    // A different address than the invite's: the account is created, the
    // invite is left alone, and verification goes out as usual.
    const other = freshEmail();
    const { client, res } = await registerWithInvite(other, inviteToken(invited));
    expect(res.status).toBe(201);
    expect(res.body.workspace).toBeNull();
    expect(res.body.inviteError).toContain(invited);
    expect(res.body.user.emailVerifiedAt).toBeNull();
    expect(testOutbox.filter((m) => m.to === other && m.subject.startsWith("Confirm"))).toHaveLength(1);
    expect((await client.get("/api/workspaces")).body.workspaces).toEqual([]);
    expect(await WorkspaceInvite.countDocuments()).toBe(1);
  });
});

describe("POST /api/invites/accept", () => {
  it("lets the invited account join (verifying it), once", async () => {
    const { owner, ws, membersPath } = await ownerWithWorkspace();
    const bob = await registerUser(server.url, "Bob");
    await owner.client.post(membersPath, { email: bob.email });
    const token = inviteToken(bob.email);

    const res = await bob.client.post("/api/invites/accept", { token });
    expect(res.status).toBe(200);
    expect(res.body.workspace).toMatchObject({ _id: ws._id, slug: ws.slug });
    expect(await memberIds(owner, ws._id)).toEqual([owner.id, bob.id].sort());
    expect((await bob.client.get("/api/auth/me")).body.user.emailVerifiedAt).not.toBeNull();

    expect((await bob.client.post("/api/invites/accept", { token })).status).toBe(400);
  });

  it("refuses a different account (403) and leaves the invite usable", async () => {
    const { owner, ws, membersPath } = await ownerWithWorkspace();
    const email = freshEmail();
    await owner.client.post(membersPath, { email });
    const token = inviteToken(email);
    const mallory = await registerUser(server.url, "Mallory");

    const res = await mallory.client.post("/api/invites/accept", { token });
    expect(res.status).toBe(403);
    expect(res.body.message).toContain(email);
    expect(await memberIds(owner, ws._id)).toEqual([owner.id]);
    expect((await anonymous().post("/api/invites/lookup", { token })).status).toBe(200);
  });

  it("needs a session (401) and the CSRF header (403)", async () => {
    const { owner, membersPath } = await ownerWithWorkspace();
    const bob = await registerUser(server.url, "Bob");
    await owner.client.post(membersPath, { email: bob.email });
    const token = inviteToken(bob.email);

    expect((await anonymous().post("/api/invites/accept", { token })).status).toBe(401);
    expect((await bob.client.post("/api/invites/accept", { token }, { csrf: false })).status).toBe(403);
  });
});

describe("pending invites (owner only)", () => {
  it("can be cancelled, which kills the link", async () => {
    const { owner, membersPath, invitesPath } = await ownerWithWorkspace();
    const email = freshEmail();
    const inviteId = (await owner.client.post(membersPath, { email })).body.invite._id;

    expect((await owner.client.delete(`${invitesPath}/${inviteId}`)).status).toBe(204);
    expect((await owner.client.get(invitesPath)).body.invites).toEqual([]);
    expect((await anonymous().post("/api/invites/lookup", { token: inviteToken(email) })).status).toBe(400);
    expect((await owner.client.delete(`${invitesPath}/${inviteId}`)).status).toBe(404);
    expect((await owner.client.delete(`${invitesPath}/not-an-id`)).status).toBe(404);
  });

  it("are hidden from members, and one workspace's owner can't cancel another's invites", async () => {
    const { owner, membersPath, invitesPath } = await ownerWithWorkspace();
    const inviteId = (await owner.client.post(membersPath, { email: freshEmail() })).body.invite._id;

    const bob = await registerUser(server.url, "Bob");
    await markVerified(bob);
    await owner.client.post(membersPath, { email: bob.email });
    expect((await bob.client.get(invitesPath)).status).toBe(403);
    expect((await bob.client.delete(`${invitesPath}/${inviteId}`)).status).toBe(403);

    // Bob owns a workspace of his own, which passes the owner check, but the
    // invite isn't in it.
    const bobs = (await bob.client.post("/api/workspaces", { name: "Bob's" })).body.workspace;
    expect((await bob.client.delete(`/api/workspaces/${bobs._id}/invites/${inviteId}`)).status).toBe(404);
    expect(await WorkspaceInvite.countDocuments()).toBe(1);
  });
});

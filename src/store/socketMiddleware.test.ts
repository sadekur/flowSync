import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeStore, type AppStore } from "./index";
import { joinProject, leaveProject, socketConnect, socketDisconnect } from "./socketSlice";
import { messagesHydrated, sendMessage } from "./messagesSlice";
import { tasksHydrated } from "./tasksSlice";
import { typingStart, typingStop } from "./presenceSlice";
import { latestSocket, type FakeSocket } from "@/test/fakeSocket";
import { makeMessage, makeNotification, makeTask, PROJECT_ID } from "@/test/factories";

vi.mock("socket.io-client", () => import("@/test/fakeSocket"));

const OTHER_PROJECT = "eeeeeeeeeeeeeeeeeeeeeeee";
const bob = { _id: "222222222222222222222222", name: "Bob" };

let store: AppStore;

/** A store whose socket is connected, in PROJECT_ID's room. */
function connectAndJoin(): FakeSocket {
  store.dispatch(socketConnect());
  const socket = latestSocket();
  socket.serverAccept();
  store.dispatch(joinProject(PROJECT_ID));
  socket.lastEmit("project:join").ack({ ok: true, onlineUserIds: ["me"] });
  return socket;
}

beforeEach(() => {
  store = makeStore();
});
afterEach(() => {
  store.dispatch(socketDisconnect());
  vi.useRealTimers();
});

describe("connection and rooms", () => {
  it("connects with credentials once, however often socketConnect is dispatched", () => {
    store.dispatch(socketConnect());
    const socket = latestSocket();
    expect(socket.options).toMatchObject({ withCredentials: true, autoConnect: false });
    expect(socket.active).toBe(true);
    store.dispatch(socketConnect());
    expect(latestSocket()).toBe(socket);
    expect(store.getState().socket.status).toBe("connecting");
  });

  it("joins a project requested before the connection was up, once it is", () => {
    store.dispatch(socketConnect());
    const socket = latestSocket();
    store.dispatch(joinProject(PROJECT_ID));
    expect(socket.emitsOf("project:join")).toHaveLength(0);

    socket.serverAccept();
    const join = socket.lastEmit("project:join");
    expect(join.payload).toEqual({ projectId: PROJECT_ID });
    join.ack({ ok: true, onlineUserIds: ["me", "bob"] });

    expect(store.getState().socket).toMatchObject({ status: "connected", joinedProjectId: PROJECT_ID });
    expect(store.getState().presence.onlineUserIds).toEqual(["me", "bob"]);
  });

  it("re-joins the open project after every reconnect", () => {
    const socket = connectAndJoin();

    socket.dropConnection();
    expect(store.getState().socket).toMatchObject({ status: "reconnecting", joinedProjectId: null });

    socket.serverAccept();
    expect(socket.emitsOf("project:join")).toHaveLength(2);
    socket.lastEmit("project:join").ack({ ok: true, onlineUserIds: ["me"] });
    expect(store.getState().socket).toMatchObject({ status: "connected", joinedProjectId: PROJECT_ID });
  });

  it("doesn't re-join a project the page has left", () => {
    const socket = connectAndJoin();
    store.dispatch(leaveProject(PROJECT_ID));
    expect(socket.lastEmit("project:leave").payload).toEqual({ projectId: PROJECT_ID });

    socket.dropConnection();
    socket.serverAccept();
    expect(socket.emitsOf("project:join")).toHaveLength(1);
  });

  it("leaves again if a join ack arrives after the page moved on", () => {
    store.dispatch(socketConnect());
    const socket = latestSocket();
    socket.serverAccept();
    store.dispatch(joinProject(PROJECT_ID));
    const staleJoin = socket.lastEmit("project:join");
    // Navigated to another project before the first join was acked.
    store.dispatch(leaveProject(PROJECT_ID));
    store.dispatch(joinProject(OTHER_PROJECT));
    const leavesBefore = socket.emitsOf("project:leave").length;

    staleJoin.ack({ ok: true, onlineUserIds: [] });
    expect(socket.emitsOf("project:leave")).toHaveLength(leavesBefore + 1);
    expect(socket.lastEmit("project:leave").payload).toEqual({ projectId: PROJECT_ID });
    expect(store.getState().socket.joinedProjectId).toBeNull();
  });

  it("reports a refused join without claiming to be in the room", () => {
    store.dispatch(socketConnect());
    const socket = latestSocket();
    socket.serverAccept();
    store.dispatch(joinProject(PROJECT_ID));
    socket.lastEmit("project:join").ack({ ok: false, error: "Project not found" });
    expect(store.getState().socket).toMatchObject({ joinedProjectId: null, error: "Project not found" });
  });

  it("ends in 'error' when the handshake is refused", () => {
    store.dispatch(socketConnect());
    latestSocket().serverReject("Not authenticated");
    expect(store.getState().socket).toMatchObject({ status: "error", error: "Not authenticated" });
  });

  it("closes the socket and clears state on socketDisconnect (logout)", () => {
    const socket = connectAndJoin();
    store.dispatch(socketDisconnect());
    expect(socket.connected).toBe(false);
    expect(socket.active).toBe(false);
    expect(store.getState().socket).toEqual({ status: "idle", error: null, joinedProjectId: null });
  });
});

describe("server events", () => {
  it("routes chat, task and notification events into the store", () => {
    const socket = connectAndJoin();
    store.dispatch(messagesHydrated({ projectId: PROJECT_ID, messages: [], hasOlder: false }));
    const task = makeTask("Live");
    store.dispatch(tasksHydrated({ projectId: PROJECT_ID, tasks: [task] }));

    const message = makeMessage(bob, "hi");
    socket.serverEmit("message:new", message);
    socket.serverEmit("task:updated", { ...task, status: "done" });
    socket.serverEmit("task:created", makeTask("New"));
    socket.serverEmit("notification:new", makeNotification("New"));

    const state = store.getState();
    expect(state.messages.entities[message._id]).toEqual(message);
    expect(state.tasks.entities[task._id]?.status).toBe("done");
    expect(state.tasks.ids).toHaveLength(2);
    expect(state.notifications.unreadCount).toBe(1);

    socket.serverEmit("task:deleted", { projectId: PROJECT_ID, taskId: task._id });
    expect(store.getState().tasks.ids).toHaveLength(1);
  });

  it("tracks presence from user:online / user:offline", () => {
    const socket = connectAndJoin();
    socket.serverEmit("user:online", { projectId: PROJECT_ID, userId: "bob" });
    expect(store.getState().presence.onlineUserIds).toEqual(["me", "bob"]);
    socket.serverEmit("user:offline", { projectId: PROJECT_ID, userId: "bob" });
    expect(store.getState().presence.onlineUserIds).toEqual(["me"]);
  });
});

describe("sendMessage", () => {
  it("resolves ok with the acked message, which shows straight away", async () => {
    const socket = connectAndJoin();
    store.dispatch(messagesHydrated({ projectId: PROJECT_ID, messages: [], hasOlder: false }));

    const result = store.dispatch(sendMessage({ projectId: PROJECT_ID, text: "hello" }));
    const sent = socket.lastEmit("message:send");
    expect(sent.payload).toEqual({ projectId: PROJECT_ID, text: "hello" });
    const saved = makeMessage({ _id: "me", name: "Me" }, "hello");
    sent.ack({ ok: true, message: saved });

    await expect(result).resolves.toEqual({ ok: true });
    expect(store.getState().messages.ids).toEqual([saved._id]);
  });

  it("passes the server's error through", async () => {
    const socket = connectAndJoin();
    const result = store.dispatch(sendMessage({ projectId: PROJECT_ID, text: "spam" }));
    socket.lastEmit("message:send").ack({ ok: false, error: "You're sending messages too fast" });
    await expect(result).resolves.toEqual({ ok: false, error: "You're sending messages too fast" });
  });

  it("fails fast when disconnected, and on an ack timeout", async () => {
    store.dispatch(socketConnect());
    await expect(store.dispatch(sendMessage({ projectId: PROJECT_ID, text: "x" }))).resolves.toEqual({
      ok: false,
      error: "Not connected — try again in a moment",
    });

    latestSocket().serverAccept();
    const result = store.dispatch(sendMessage({ projectId: PROJECT_ID, text: "x" }));
    latestSocket().lastEmit("message:send").timeOut!();
    await expect(result).resolves.toEqual({ ok: false, error: "The server didn't respond — try again" });
  });
});

describe("typing", () => {
  it("throttles typing:start to one per 2.5 s and sends typing:stop 3 s after the last keystroke", () => {
    vi.useFakeTimers();
    const socket = connectAndJoin();

    for (let i = 0; i < 5; i++) {
      store.dispatch(typingStart({ projectId: PROJECT_ID }));
      vi.advanceTimersByTime(400);
    }
    expect(socket.emitsOf("typing:start")).toHaveLength(1);

    vi.advanceTimersByTime(600); // 2.6 s since the first start
    store.dispatch(typingStart({ projectId: PROJECT_ID }));
    expect(socket.emitsOf("typing:start")).toHaveLength(2);
    expect(socket.emitsOf("typing:stop")).toHaveLength(0);

    vi.advanceTimersByTime(3_000);
    expect(socket.emitsOf("typing:stop")).toHaveLength(1);
    expect(socket.lastEmit("typing:stop").payload).toEqual({ projectId: PROJECT_ID });
  });

  it("sends typing:stop at once on an explicit stop, but only after a start", () => {
    const socket = connectAndJoin();
    store.dispatch(typingStop({ projectId: PROJECT_ID }));
    expect(socket.emitsOf("typing:stop")).toHaveLength(0);

    store.dispatch(typingStart({ projectId: PROJECT_ID }));
    store.dispatch(typingStop({ projectId: PROJECT_ID }));
    expect(socket.emitsOf("typing:stop")).toHaveLength(1);
  });

  it("doesn't emit typing for a project the socket isn't in", () => {
    const socket = connectAndJoin();
    store.dispatch(typingStart({ projectId: OTHER_PROJECT }));
    expect(socket.emitsOf("typing:start")).toHaveLength(0);
  });

  it("clears a peer's typing indicator after 3.5 s without a fresh typing:start", () => {
    vi.useFakeTimers();
    const socket = connectAndJoin();
    socket.serverEmit("typing:start", { projectId: PROJECT_ID, userId: "bob" });
    expect(store.getState().presence.typingUserIds).toEqual(["bob"]);

    vi.advanceTimersByTime(3_000);
    // A re-sent start keeps it alive…
    socket.serverEmit("typing:start", { projectId: PROJECT_ID, userId: "bob" });
    vi.advanceTimersByTime(3_000);
    expect(store.getState().presence.typingUserIds).toEqual(["bob"]);
    // …and without one it expires, even if typing:stop never comes.
    vi.advanceTimersByTime(600);
    expect(store.getState().presence.typingUserIds).toEqual([]);
  });
});

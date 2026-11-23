import { describe, expect, it } from "vitest";
import { makeStore } from "./index";
import { messagesHydrated, messagesReceived, olderMessagesLoaded, selectAllMessages } from "./messagesSlice";
import { selectAllTasks, taskRemoved, tasksHydrated, taskUpserted } from "./tasksSlice";
import { typingStarted, typingStopped, userOffline, userOnline } from "./presenceSlice";
import { allMarkedRead, notificationReceived, notificationsHydrated } from "./notificationsSlice";
import { connected, connectFailed, disconnected, leaveProject, roomJoined, socketConnect, socketDisconnect } from "./socketSlice";
import { makeMessage, makeNotification, makeTask, PROJECT_ID } from "@/test/factories";

const OTHER_PROJECT = "eeeeeeeeeeeeeeeeeeeeeeee";
const alice = { _id: "111111111111111111111111", name: "Alice" };

describe("messagesSlice", () => {
  it("keeps one copy of each message, oldest first, however often it arrives", () => {
    const store = makeStore();
    const [m1, m2, m3] = [makeMessage(alice, "one"), makeMessage(alice, "two"), makeMessage(alice, "three")];
    store.dispatch(messagesHydrated({ projectId: PROJECT_ID, messages: [m2], hasOlder: true }));
    // A live event, the send ack and the reconnect catch-up can all deliver m3.
    store.dispatch(messagesReceived({ projectId: PROJECT_ID, messages: [m3] }));
    store.dispatch(messagesReceived({ projectId: PROJECT_ID, messages: [m3] }));
    store.dispatch(olderMessagesLoaded({ projectId: PROJECT_ID, messages: [m1], hasOlder: false }));

    expect(selectAllMessages(store.getState()).map((m) => m.text)).toEqual(["one", "two", "three"]);
    expect(store.getState().messages.hasOlder).toBe(false);
  });

  it("ignores messages for a project that isn't open", () => {
    const store = makeStore();
    store.dispatch(messagesHydrated({ projectId: PROJECT_ID, messages: [], hasOlder: false }));
    store.dispatch(messagesReceived({ projectId: OTHER_PROJECT, messages: [makeMessage(alice, "elsewhere")] }));
    expect(selectAllMessages(store.getState())).toEqual([]);
  });

  it("merges a re-hydrate of the same project but replaces on a project switch", () => {
    const store = makeStore();
    const live = makeMessage(alice, "live");
    store.dispatch(messagesHydrated({ projectId: PROJECT_ID, messages: [], hasOlder: false }));
    store.dispatch(messagesReceived({ projectId: PROJECT_ID, messages: [live] }));
    // router.refresh() re-hydrates with a server page that predates `live`.
    store.dispatch(messagesHydrated({ projectId: PROJECT_ID, messages: [], hasOlder: false }));
    expect(selectAllMessages(store.getState())).toEqual([live]);

    store.dispatch(messagesHydrated({ projectId: OTHER_PROJECT, messages: [], hasOlder: false }));
    expect(selectAllMessages(store.getState())).toEqual([]);
  });
});

describe("tasksSlice", () => {
  it("orders newest first, upserts by id and removes", () => {
    const store = makeStore();
    const older = makeTask("older");
    const newer = makeTask("newer");
    store.dispatch(tasksHydrated({ projectId: PROJECT_ID, tasks: [older] }));
    store.dispatch(taskUpserted({ projectId: PROJECT_ID, task: newer }));
    store.dispatch(taskUpserted({ projectId: PROJECT_ID, task: { ...older, status: "done" } }));
    expect(selectAllTasks(store.getState()).map((t) => [t.title, t.status])).toEqual([
      ["newer", "todo"],
      ["older", "done"],
    ]);

    store.dispatch(taskRemoved({ projectId: PROJECT_ID, taskId: newer._id }));
    store.dispatch(taskRemoved({ projectId: OTHER_PROJECT, taskId: older._id }));
    expect(selectAllTasks(store.getState()).map((t) => t.title)).toEqual(["older"]);
  });

  it("drops tasks the catch-up fetch no longer has (deleted while out of the room)", () => {
    const store = makeStore();
    const kept = makeTask("kept");
    const gone = makeTask("deleted while offline");
    store.dispatch(tasksHydrated({ projectId: PROJECT_ID, tasks: [kept, gone] }));

    store.dispatch(tasksSyncStarted({ projectId: PROJECT_ID }));
    store.dispatch(tasksSynced({ projectId: PROJECT_ID, tasks: [{ ...kept, status: "done" }] }));
    expect(selectAllTasks(store.getState()).map((t) => [t.title, t.status])).toEqual([["kept", "done"]]);
    expect(store.getState().tasks.syncTouched).toBeNull();
  });

  it("keeps live events that land while the catch-up fetch is in flight", () => {
    const store = makeStore();
    const edited = makeTask("edited live");
    const deleted = makeTask("deleted live");
    store.dispatch(tasksHydrated({ projectId: PROJECT_ID, tasks: [edited, deleted] }));

    store.dispatch(tasksSyncStarted({ projectId: PROJECT_ID }));
    // The fetch was served before these events, so its copy is stale.
    const created = makeTask("created live");
    store.dispatch(taskUpserted({ projectId: PROJECT_ID, task: created }));
    store.dispatch(taskUpserted({ projectId: PROJECT_ID, task: { ...edited, status: "done" } }));
    store.dispatch(taskRemoved({ projectId: PROJECT_ID, taskId: deleted._id }));
    store.dispatch(tasksSynced({ projectId: PROJECT_ID, tasks: [edited, deleted] }));

    expect(selectAllTasks(store.getState()).map((t) => [t.title, t.status])).toEqual([
      ["created live", "todo"],
      ["edited live", "done"],
    ]);
  });

  it("ignores a catch-up result for another project, or with no catch-up running", () => {
    const store = makeStore();
    const task = makeTask("stays");
    store.dispatch(tasksHydrated({ projectId: PROJECT_ID, tasks: [task] }));

    store.dispatch(tasksSynced({ projectId: PROJECT_ID, tasks: [] }));
    store.dispatch(tasksSyncStarted({ projectId: PROJECT_ID }));
    store.dispatch(tasksSynced({ projectId: OTHER_PROJECT, tasks: [] }));
    expect(selectAllTasks(store.getState()).map((t) => t.title)).toEqual(["stays"]);
  });
});

describe("presenceSlice", () => {
  it("takes the join-ack snapshot and applies user:online/offline idempotently", () => {
    const store = makeStore();
    store.dispatch(roomJoined({ projectId: PROJECT_ID, onlineUserIds: ["a"] }));
    store.dispatch(userOnline({ projectId: PROJECT_ID, userId: "b" }));
    store.dispatch(userOnline({ projectId: PROJECT_ID, userId: "b" }));
    store.dispatch(userOnline({ projectId: OTHER_PROJECT, userId: "c" }));
    expect(store.getState().presence.onlineUserIds).toEqual(["a", "b"]);

    store.dispatch(typingStarted({ projectId: PROJECT_ID, userId: "b" }));
    // Going offline also clears a stuck typing indicator.
    store.dispatch(userOffline({ projectId: PROJECT_ID, userId: "b" }));
    store.dispatch(userOffline({ projectId: PROJECT_ID, userId: "b" }));
    expect(store.getState().presence).toMatchObject({ onlineUserIds: ["a"], typingUserIds: [] });
  });

  it("tracks who's typing without duplicates", () => {
    const store = makeStore();
    store.dispatch(roomJoined({ projectId: PROJECT_ID, onlineUserIds: [] }));
    store.dispatch(typingStarted({ projectId: PROJECT_ID, userId: "a" }));
    store.dispatch(typingStarted({ projectId: PROJECT_ID, userId: "a" }));
    store.dispatch(typingStarted({ projectId: PROJECT_ID, userId: "b" }));
    store.dispatch(typingStopped({ projectId: PROJECT_ID, userId: "a" }));
    expect(store.getState().presence.typingUserIds).toEqual(["b"]);
  });

  it("resets when the project is left, and replaces the snapshot on a re-join", () => {
    const store = makeStore();
    store.dispatch(roomJoined({ projectId: PROJECT_ID, onlineUserIds: ["a", "b"] }));
    // A reconnect's fresh snapshot wins over whatever was accumulated.
    store.dispatch(roomJoined({ projectId: PROJECT_ID, onlineUserIds: ["a"] }));
    expect(store.getState().presence.onlineUserIds).toEqual(["a"]);

    store.dispatch(leaveProject(PROJECT_ID));
    expect(store.getState().presence).toEqual({ projectId: null, onlineUserIds: [], typingUserIds: [] });
  });
});

describe("notificationsSlice", () => {
  it("counts a live notification once, and only if it's unread", () => {
    const store = makeStore();
    store.dispatch(notificationsHydrated({ notifications: [], unreadCount: 3 }));
    const fresh = makeNotification("fresh");
    store.dispatch(notificationReceived(fresh));
    store.dispatch(notificationReceived(fresh));
    store.dispatch(notificationReceived(makeNotification("already read", { read: true })));
    expect(store.getState().notifications.unreadCount).toBe(4);
    expect(store.getState().notifications.ids[0]).not.toBe(fresh._id);

    store.dispatch(allMarkedRead());
    const { unreadCount, entities } = store.getState().notifications;
    expect(unreadCount).toBe(0);
    expect(Object.values(entities).every((n) => n?.read)).toBe(true);
  });
});

describe("socketSlice", () => {
  it("follows the connection lifecycle", () => {
    const store = makeStore();
    const status = () => store.getState().socket.status;

    store.dispatch(socketConnect());
    expect(status()).toBe("connecting");
    store.dispatch(connected());
    store.dispatch(roomJoined({ projectId: PROJECT_ID, onlineUserIds: [] }));
    expect(store.getState().socket.joinedProjectId).toBe(PROJECT_ID);

    // A network drop: rooms are per connection, so "in the room" is cleared.
    store.dispatch(disconnected({ willReconnect: true }));
    expect(store.getState().socket).toMatchObject({ status: "reconnecting", joinedProjectId: null });

    store.dispatch(connectFailed({ message: "Invalid or expired access token", willRetry: false }));
    expect(store.getState().socket).toMatchObject({ status: "error", error: "Invalid or expired access token" });

    store.dispatch(socketDisconnect());
    expect(store.getState().socket).toEqual({ status: "idle", error: null, joinedProjectId: null });
  });

  it("clears everything real-time on logout (socketDisconnect)", () => {
    const store = makeStore();
    store.dispatch(messagesHydrated({ projectId: PROJECT_ID, messages: [makeMessage(alice, "x")], hasOlder: true }));
    store.dispatch(tasksHydrated({ projectId: PROJECT_ID, tasks: [makeTask("x")] }));
    store.dispatch(notificationsHydrated({ notifications: [makeNotification("x")], unreadCount: 1 }));
    store.dispatch(socketDisconnect());
    const state = store.getState();
    expect(state.messages.ids).toEqual([]);
    expect(state.tasks.ids).toEqual([]);
    expect(state.notifications.ids).toEqual([]);
    expect(state.notifications.unreadCount).toBe(0);
  });
});

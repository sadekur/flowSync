# Notifications

**Implemented (Step 10).** Notifications are stored in MongoDB and pushed live to the recipient's own sockets. They are per-user: one row is created for a specific recipient when someone else does something relevant to them.

## When a notification is created

- A task is **assigned to you** → `task_assigned`.
- A task **already assigned to you** is updated → `task_updated` (if the assignee changes to someone else, that someone gets `task_assigned`; if it's set to you, you get `task_assigned`).
- A **message is posted** in any project of a workspace you're a member of → `message`, for every member **except the sender**.

The **actor never gets a notification for their own action**.

## Shape

Identical in `GET /api/notifications` and the `notification:new` socket event:

```ts
{
  _id: string;
  type: "task_assigned" | "task_updated" | "message";
  read: boolean;
  actor: { _id: string; name: string } | null;   // null only if the user no longer exists
  workspace: string;                             // workspace ObjectId
  project: string;                               // project ObjectId — the click target
  task?: string;                                 // task ObjectId (task_* types)
  message?: string;                              // message ObjectId (message type)
  preview: string;                               // task title / message snippet, snapshotted at creation
  createdAt: string;                             // ISO date
}
```

`preview` is a snapshot: editing the task or the original message afterwards does not rewrite past notifications. It's stored so the list needs no join beyond the actor.

## `GET /api/notifications`

Requires auth.

**200** — `{ "notifications": [...], "unreadCount": number }`
- `notifications` is the caller's **newest 50**, newest-first.
- `unreadCount` is a real `countDocuments({ read: false })`, so the badge is correct even when more than 50 are unread.

Errors: **401** not authenticated.

## `POST /api/notifications/read`

Requires auth + `X-CSRF-Token`. Marks **all** of the caller's notifications read (the UI calls this when the dropdown opens).

**204.** **403** missing/invalid CSRF.

## Real-time

When a notification is created, `notification:new` (the shape above) is emitted to the recipient's **own room**, `user:{userId}` — not a project room. That's what lets it reach a user who isn't currently viewing the affected project, and every one of their open tabs. The room is joined automatically at socket connection (`backend/src/sockets/index.ts`); see `docs/api/sockets.md`.

A recipient who is offline simply sees the persisted list on their next `GET /api/notifications` — nothing is replayed over the socket.

## Cascade

Notifications are deleted with their workspace, their project, and (for task notifications) their task — same explicit cascade as tasks and messages (`DECISIONS.md`).

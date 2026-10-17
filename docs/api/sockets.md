# Socket.IO

**Implemented:** connection, auth and project rooms (Step 6); chat (Step 7); typing & presence (Step 8); task updates (Step 9); notifications (Step 10).

Same host/port as the REST API (`NEXT_PUBLIC_SOCKET_URL`, default `http://localhost:4000`), default path `/socket.io/`. Event types: `backend/src/sockets/types.ts`, mirrored by hand in `src/types/socket.ts`.

## Connecting

```ts
io(NEXT_PUBLIC_SOCKET_URL, { withCredentials: true })
```

The handshake is accepted only when **both**:

1. **`Origin` header is exactly `CORS_ORIGIN`.** Checked in `allowRequest` for polling *and* WebSocket transports. A missing or foreign Origin is rejected with HTTP `403` before auth runs.
2. **The `accessToken` httpOnly cookie holds a valid access JWT.** This is the same cookie and check as `requireAuth` on the REST side. On failure the client gets `connect_error` with one of:
   - `"Not authenticated"`: no cookie
   - `"Invalid or expired access token"`

   After an auth rejection the client does **not** auto-retry (`socket.active === false`). Network errors *are* retried automatically.

Auth is checked once per handshake, including every automatic reconnect. It is not re-checked per event.

Packets larger than **64 KB** (`maxHttpBufferSize`) are rejected, which closes the connection.

## Client → server events

Every event takes an **ack callback** with `{ ok: true, ...data }` or `{ ok: false, error: string }`.

### `project:join`

```ts
socket.emit("project:join", { projectId }, (res) => …)
```

- `projectId`: the project's **ObjectId**. Slugs are not accepted, so each project maps to exactly one room.
- Joins room `project:{projectId}` if the user is a member of the project's workspace (same rule as `requireWorkspaceMember`).
- On success the socket is also registered in Redis presence for the room (see `user:online` below) and the ack returns the current online snapshot: `{ ok: true, onlineUserIds: string[] }`.
- Errors:
  - `"Invalid projectId"`: not an ObjectId
  - `"Project not found"`: the project doesn't exist **or** the user isn't a member. Both cases return the same error on purpose, so project ids can't be probed.
  - `"Internal error"`

### `project:leave`

```ts
socket.emit("project:leave", { projectId }, (res) => …)
```

Leaves room `project:{projectId}`. No membership check is needed, because leaving a room grants nothing. The only possible error is `"Invalid projectId"`.

### `message:send`

```ts
socket.emit("message:send", { projectId, text }, (res) => …)
// res: { ok: true, message: Message } | { ok: false, error: string }
```

- `projectId`: the project's **ObjectId** (no slugs).
- `text`: trimmed, then must be 1–2000 chars. Stored and sent back as plain text.
- The sender does **not** need to have joined the room. Workspace membership is re-checked against the database on **every** send, not just at join time. So a member removed from the workspace can't keep posting from a room they joined earlier.
- On success the message is saved, broadcast as `message:new` to room `project:{projectId}` (the sender's own sockets included), and returned in the ack. Clients should dedupe by `_id`.
- Rate limit: **20 sends per 10 s per user**, across all of that user's tabs. It's counted in Redis, and only for payloads that pass validation.
- Errors:
  - a validation message (e.g. `"text is required"`, `"text is too long"`, `"must be a valid id"`)
  - `"You're sending messages too fast"`
  - `"Project not found"`: doesn't exist **or** not a member
  - `"Internal error"`

### `typing:start` / `typing:stop`

```ts
socket.emit("typing:start", { projectId }, (res) => …)
socket.emit("typing:stop", { projectId }, (res) => …)
```

- `projectId`: the project's **ObjectId** (no slugs).
- Ephemeral — nothing is stored anywhere. `typing:start` re-checks workspace membership (like `message:send`) and is rate-limited: **30 starts per 10 s per user** (the client already throttles to one per ~2.5 s, so this only caps a misbehaving client). `typing:stop` skips both checks: it only ever clears an indicator and reveals nothing, and it's sent on input-clear and page navigation where speed matters more.
- The server relays `typing:start`/`typing:stop` to the project room **excluding the sender** (`socket.to(room)`), carrying `{ projectId, userId }`.
- Errors: `"Invalid projectId"`, `"Rate limited"`, `"Project not found"` (start only), `"Internal error"`.

## Server → client events

### `message:new`

```ts
socket.on("message:new", (message: Message) => …)
```

Sent to everyone in `project:{message.project}` when a message is posted. The shape is in `docs/api/messages.md`.

### `task:created` / `task:updated` / `task:deleted`

```ts
socket.on("task:created", (task: Task) => …)
socket.on("task:updated", (task: Task) => …)
socket.on("task:deleted", ({ projectId, taskId }) => …)
```

Sent to everyone in `project:{projectId}` after a **successful REST task mutation** (`backend/src/sockets/emitter.ts`, called from `task.controller.ts`). Task writes are REST-only (membership + CSRF already apply there — see `docs/api/tasks.md`); these events are the real-time delivery of that write. `task:created`/`task:updated` carry the task in the same JSON shape as the REST response; `task:deleted` carries only `{ projectId, taskId }` because the document is gone. The mutating client's own sockets get the event too, so clients dedupe by `_id`.

Unlike `message:new`, no socket **handler** produces these — there is no `task:send`. A client must be in `project:{projectId}` to receive them, and always gets the authoritative current list from `GET …/tasks` on every (re)join (see Notes).

### `notification:new`

```ts
socket.on("notification:new", (notification: Notification) => …)
```

Sent to the **recipient's own room**, `user:{userId}` — not a project room. Every connection joins its user room automatically at handshake (`backend/src/sockets/index.ts`), so a notification reaches the user regardless of which project (if any) they're viewing, on every tab. Created by `notification.service.ts` at the task REST write points and on `message:send`; the payload is documented in `docs/api/notifications.md`.

### `user:online` / `user:offline`

```ts
socket.on("user:online", ({ projectId, userId }) => …)
socket.on("user:offline", ({ projectId, userId }) => …)
```

Sent to everyone in `project:{projectId}` when a user's **first** socket joins the room (`user:online`) or their **last** socket leaves it — by `project:leave` or disconnect (`user:offline`). Presence is per project room, not global.

Presence lives **only in Redis** (never Mongo): one hash per project, `presence:project:{projectId}`, field = userId, value = the number of that user's sockets in the room. Multi-tab semantics fall out of the count: a second tab bumps it without another `user:online`, closing one of two tabs doesn't fire `user:offline` while the other stays connected. The keys carry a 24 h TTL (refreshed on every change) purely as a crash guard. Clients also get the full snapshot from the `project:join` ack, so the online list renders correctly even when a page loads after everyone else already joined.

### `typing:start` / `typing:stop` (server → client)

```ts
socket.on("typing:start", ({ projectId, userId }) => …)
socket.on("typing:stop", ({ projectId, userId }) => …)
```

Relayed `typing:start`/`typing:stop` events, excluding the sender. Clients show "X is typing…" on `typing:start` and clear it on `typing:stop` **or** their own expiry timer (~3.5 s), so a sender whose tab dies mid-typing never leaves a stuck indicator.

## Notes

- Rooms are per-connection. After any reconnect the client must emit `project:join` again. `socketMiddleware` does this automatically for the currently open project.
- Events aren't replayed. Anything posted while a client was out of the room is missed. After every (re)join, the chat UI fetches `GET …/messages?after=<newest id it has>` to fill the gap.
- Task events aren't replayed either. After every (re)join the task list refetches the full `GET …/tasks` list (it isn't paged), which also covers the gap between the server render and the first join. A task deleted while the client was disconnected is only reconciled by that refetch catching it missing — the client merges rather than replaces, so it won't be re-added but isn't actively removed either until the next full hydrate; acceptable for the MVP.
- Presence isn't replayed either — that's what the `onlineUserIds` snapshot in the `project:join` ack is for.
- Notifications aren't replayed. `notification:new` only reaches a connected user; the persisted list is fetched once on mount by the bell (`GET /api/notifications`), so an offline recipient sees everything on their next load.

## Multiple backend instances

Every event in this document works across backend instances. The server uses `@socket.io/redis-adapter`, so a broadcast to `project:{id}` or `user:{id}` from any instance (a socket handler or the REST task layer) reaches sockets connected to every other instance. Presence counts, rate limits and the membership cache are in the same shared Redis, so they agree across instances too.

The client doesn't change. Each connection is still served by one instance for its whole life, and a reconnect may land on a different one, which the auto re-join already handles. Behind a load balancer, the HTTP long-polling transport needs sticky sessions (Step 13's Nginx config); WebSocket-only connections don't.

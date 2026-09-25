# Socket.IO

**Implemented:** connection, auth and project rooms (Step 6); chat (Step 7).

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

## Server → client events

### `message:new`

```ts
socket.on("message:new", (message: Message) => …)
```

Sent to everyone in `project:{message.project}` when a message is posted. The shape is in `docs/api/messages.md`.

## Notes

- Rooms are per-connection. After any reconnect the client must emit `project:join` again. `socketMiddleware` does this automatically for the currently open project.
- Events aren't replayed. Anything posted while a client was out of the room is missed. After every (re)join, the chat UI fetches `GET …/messages?after=<newest id it has>` to fill the gap.

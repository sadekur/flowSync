# Messages

**Implemented (Step 7).** Each project has one chat.

- **Reading** history is REST (below).
- **Sending** goes over Socket.IO (`message:send`, see `docs/api/sockets.md`). There is no REST endpoint for sending.

Message shape (identical in REST responses and the `message:new` socket event):

```ts
{
  _id: string;
  project: string;                               // project ObjectId
  sender: { _id: string; name: string } | null;  // null only if the user no longer exists
  text: string;                                  // 1–2000 chars, trimmed; plain text, never HTML
  createdAt: string;                             // ISO date
}
```

Messages are deleted with their project, and with their workspace (cascade, same as tasks).

## `GET /api/workspaces/:workspaceId/projects/:projectId/messages`

Requires auth + workspace membership. `:workspaceId` / `:projectId` accept an ObjectId or a slug.

Query (all optional; `before` and `after` can't be combined):

| Param | Meaning |
|---|---|
| `limit` | 1–50, default 30 |
| `before` | message `_id`: returns the newest `limit` messages older than it (scroll back through history) |
| `after` | message `_id`: returns the oldest `limit` messages newer than it (catch up after a reconnect) |

No cursor returns the newest `limit` messages.

**200** `{ "messages": [...], "hasMore": boolean }`
- `messages` is always **oldest-first**, whichever direction was read.
- `hasMore` says whether another page exists in that direction: older ones for no cursor or `before`, newer ones for `after`.

Errors:
- **400**: invalid cursor or `limit`, or `before` + `after` together
- **401**: not authenticated
- **403**: not a member
- **404**: no such workspace/project

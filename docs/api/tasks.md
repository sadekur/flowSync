# Tasks

**Implemented.** Nested under a workspace's project. Requires auth + workspace membership; mutating routes also require `X-CSRF-Token`.

`status` is one of `"todo" | "in_progress" | "done"` (default `"todo"`). `assignee`, if given, must be the id of a current member of the workspace — otherwise **400**.

## Real-time

Writes stay REST (membership + CSRF are already enforced here); only their delivery is real-time. After each successful mutation the backend broadcasts to socket room `project:{projectId}` (see `docs/api/sockets.md`):

- `task:created` / `task:updated` → the task, in the same JSON shape a REST response returns.
- `task:deleted` → `{ projectId, taskId }` (the document is gone, so only its ids are sent).

The mutating client's own sockets receive the broadcast too, so clients dedupe by `_id`. The REST response keeps being the actor's immediate confirmation; the broadcast is how every other open tab/project viewer updates without a refresh.

## `POST /api/workspaces/:workspaceId/projects/:projectId/tasks`

Body: `{ "title": string, "description"?: string, "status"?: TaskStatus, "assignee"?: string, "dueDate"?: string }` → **201** `{ "task": {...} }`.

## `GET /api/workspaces/:workspaceId/projects/:projectId/tasks`

**200** `{ "tasks": [...] }`, newest first.

## `GET /api/workspaces/:workspaceId/projects/:projectId/tasks/:taskId`

**200** `{ "task": {...} }` · **404** no such task in this project.

## `PATCH /api/workspaces/:workspaceId/projects/:projectId/tasks/:taskId`

Same body shape as create, all fields optional. **200** `{ "task": {...} }` · **400** assignee not a workspace member.

## `DELETE /api/workspaces/:workspaceId/projects/:projectId/tasks/:taskId`

**204**.

# Projects

**Implemented.** Nested under a workspace. Requires auth + workspace membership (any member, not just the owner); mutating routes also require `X-CSRF-Token`.

`:projectId` (like `:workspaceId`) accepts either the Mongo `_id` or the `slug` — see `docs/api/workspaces.md`. A project's `slug` is generated once from `name` and is unique **within its workspace**, not globally.

## `POST /api/workspaces/:workspaceId/projects`

Body: `{ "name": string, "description"?: string }` → **201** `{ "project": {...} }` (`slug` generated from `name`).

## `GET /api/workspaces/:workspaceId/projects`

**200** `{ "projects": [...] }`, newest first.

## `GET /api/workspaces/:workspaceId/projects/:projectId`

**200** `{ "project": {...} }` · **404** no such project in this workspace.

## `PATCH /api/workspaces/:workspaceId/projects/:projectId`

Body: `{ "name"?: string, "description"?: string }` (any member, not just the creator — see `DECISIONS.md`). **200** `{ "project": {...} }`.

## `DELETE /api/workspaces/:workspaceId/projects/:projectId`

Cascades: deletes every task under the project first. **204**.

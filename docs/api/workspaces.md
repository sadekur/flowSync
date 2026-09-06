# Workspaces

**Implemented.** All routes require a valid `accessToken` cookie (`requireAuth`). Mutating routes additionally require `X-CSRF-Token` (see `docs/api/auth.md`).

A workspace has one `owner` (the creator) and a `members` array that always includes the owner. Only the owner can rename/delete the workspace or manage membership; any member can create/read/update/delete projects and tasks inside it (no finer-grained roles for the MVP — see `DECISIONS.md`).

Every `:workspaceId` route param accepts **either the Mongo `_id` or the `slug`** (`middleware/membership.ts`'s `idOrSlugFilter`) — whichever the caller has. `slug` is generated once from `name` at creation and is globally unique; renaming a workspace does not change its slug.

## `POST /api/workspaces`

Body: `{ "name": string }` → **201** `{ "workspace": {...} }` (creator becomes owner + sole member; `slug` generated from `name`).

## `GET /api/workspaces`

Workspaces the caller is a member of. **200** `{ "workspaces": [...] }`.

## `GET /api/workspaces/:workspaceId`

**200** `{ "workspace": {...} }` · **403** not a member · **404** no such workspace.

`owner` and `members` are populated here (`{ _id, name, email }` each) — the only workspace route that does this, since authorization checks elsewhere in `middleware/membership.ts` compare `members` as raw ObjectIds. The frontend uses this populated form to build the task-assignee dropdown (`src/app/projects/[id]/page.tsx`).

## `PATCH /api/workspaces/:workspaceId`

Owner only. Body: `{ "name": string }` → **200** `{ "workspace": {...} }` · **403** not the owner.

## `DELETE /api/workspaces/:workspaceId`

Owner only. Cascades: deletes every project and task inside the workspace first. **204** · **403** not the owner.

## `POST /api/workspaces/:workspaceId/members`

Owner only. Body: `{ "email": string }` → **200** `{ "workspace": {...} }` · **404** no user with that email · **409** already a member.

## `DELETE /api/workspaces/:workspaceId/members/:memberId`

Owner only. **200** `{ "workspace": {...} }` · **400** cannot remove the owner.

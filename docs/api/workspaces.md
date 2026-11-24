# Workspaces

**Implemented.** All routes require a valid `accessToken` cookie (`requireAuth`). Mutating routes additionally require `X-CSRF-Token` (see `docs/api/auth.md`).

A workspace has one `owner` (the creator) and a `members` array that always includes the owner. Only the owner can rename/delete the workspace or manage membership; any member can create/read/update/delete projects and tasks inside it (no finer-grained roles for the MVP — see `DECISIONS.md`).

Every `:workspaceId` route param accepts **either the Mongo `_id` or the `slug`** (`middleware/membership.ts`'s `idOrSlugFilter`) — whichever the caller has. `slug` is generated once from `name` at creation and is globally unique; renaming a workspace does not change its slug.

## `POST /api/workspaces`

Body: `{ "name": string }` → **201** `{ "workspace": {...} }` (creator becomes owner + sole member; `slug` generated from `name`).

## `GET /api/workspaces`

Workspaces the caller is a member of, newest first. **200** `{ "workspaces": [...] }`. Each item is `{ _id, name, slug, owner, members, createdAt, updatedAt }` with ids as strings.

Served cache-aside from Redis (`cache:user:{userId}:workspaces`, 5 min TTL). Every write below that changes what a user would see deletes that user's key first, so the list is never stale after a write through this API: create (the owner), rename/delete/add member (every member), remove member (every member plus the removed one).

## `GET /api/workspaces/:workspaceId`

**200** `{ "workspace": {...} }` · **403** not a member · **404** no such workspace.

`owner` and `members` are populated here (`{ _id, name, email }` each) — the only workspace route that does this, since authorization checks elsewhere in `middleware/membership.ts` compare `members` as raw ObjectIds. The frontend uses this populated form to build the task-assignee dropdown (`src/app/projects/[id]/page.tsx`).

## `PATCH /api/workspaces/:workspaceId`

Owner only. Body: `{ "name": string }` → **200** `{ "workspace": {...} }` · **403** not the owner.

## `DELETE /api/workspaces/:workspaceId`

Owner only. Cascades: deletes every project, task, chat message, notification and pending invite inside the workspace first. **204** · **403** not the owner.

## `POST /api/workspaces/:workspaceId/members`

Owner only. Body: `{ "email": string }` (case-insensitive). Adds or invites, depending on who has that email:

- **200** `{ "workspace": {...} }` — a **verified** account: added at once, and emailed "{owner} added you to {workspace}" with a link to `/dashboard`. A failed send is only logged. Any pending invite for that email in this workspace is deleted.
- **201** `{ "invite": { _id, email, invitedBy, expiresAt, createdAt } }` — no account, or an **unverified** one: an invite link is emailed (see `docs/api/invites.md`). An unverified account isn't added directly because whoever registered it may not own the address; the link only reaches the real inbox. Inviting the same email again replaces the token (the earlier link stops working) and resends.
- **409** already a member · **429** more than 20 adds/invites by this owner in an hour (all workspaces) · **503** the invite email couldn't be sent (no invite is kept; try again).

## `GET /api/workspaces/:workspaceId/invites`

Owner only. **200** `{ "invites": [{ _id, email, invitedBy, expiresAt, createdAt }] }`: the pending, unexpired invites, newest first. **403** not the owner.

## `DELETE /api/workspaces/:workspaceId/invites/:inviteId`

Owner only. Cancels an invite; its link stops working. **204** · **404** no such invite in this workspace (including a malformed id) · **403** not the owner.

## `DELETE /api/workspaces/:workspaceId/members/:memberId`

Owner only. **200** `{ "workspace": {...} }` · **400** cannot remove the owner.

Takes effect on sockets immediately, including on other backend instances: the cached member list (`cache:workspace:{id}:members`) is deleted, so the removed user's next `message:send` / `typing:start` is rejected with `Project not found`. They stay in the project room until they leave or reconnect, but can't write to it.

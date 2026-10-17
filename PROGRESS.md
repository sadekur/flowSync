# Project Progress

## Current State

Step 11 (Redis at scale) complete and verified live with two backend instances on one Redis (30/30). The per-event socket membership check, workspace member lists and the dashboard's workspace list are served cache-aside from Redis with invalidation on every write. Socket.IO uses the Redis adapter, so chat, typing, presence, task and notification events reach clients on any instance. Backend-only: no frontend changes.

## Completed

- [x] Next.js app + `backend/` scaffold (Step 1)
- [x] Backend bootstrap: `config/env.ts` (dotenv + zod validation), `config/db.ts` (Mongoose), `config/redis.ts` (ioredis), `utils/jwt.ts`, `utils/logger.ts`, `utils/asyncHandler.ts`, `middleware/errorHandler.ts` + `notFound.ts`, `app.ts` (helmet, CORS scoped to `CORS_ORIGIN`, cookie-parser, JSON body parsing), `server.ts` (`http.createServer` + graceful shutdown)
- [x] `GET /api/health` — checks Mongo + Redis, documented in `docs/api/health.md`
- [x] `npm run typecheck:backend`, `npm run build:backend` pass; verified nested-folder compilation and the no-Redis fail-fast path live
- [x] Redis installed locally; `GET /api/health` verified live returning `200 ok` with both Mongo and Redis connected
- [x] Step 3 — Authentication: `models/User.ts` (bcryptjs hash, `select: false` password, `tokenVersion` for future mass-invalidation), `validators/auth.validators.ts` (zod), `services/auth.service.ts`, `controllers/auth.controller.ts`, `routes/auth.routes.ts`, `utils/cookies.ts` (sets/clears the three auth cookies), `middleware/requireAuth.ts`, `middleware/csrf.ts` (double-submit, reusable for future mutating routes)
- [x] `errorHandler` now formats `ZodError`s as `400` with per-field issues
- [x] All five endpoints verified live: register (incl. 409 duplicate, 400 validation), login (incl. 401 wrong password), `/me` (incl. 401 unauthenticated), refresh (incl. 403 missing CSRF, cookie rotation), logout (incl. 403 missing CSRF) — documented in `docs/api/auth.md`
- [x] Step 4 — Workspace & Project CRUD: `models/Workspace.ts`, `Project.ts`, `Task.ts`; `middleware/membership.ts` (`loadWorkspace`/`requireWorkspaceMember`/`requireWorkspaceOwner`/`loadProject`/`loadTask`); `validators/`, `services/`, `controllers/`, `routes/` for all three resources — documented in `docs/api/workspaces.md`, `projects.md`, `tasks.md`
- [x] Removed the `.gitkeep` placeholders from `backend/src/{controllers,middleware,models,routes,services,types,validators}/` now that each holds real files; kept them in `backend/tests/` and `backend/src/sockets/handlers/` (still empty — Steps 12 and 6)
- [x] Verified live end-to-end with two real users (Alice/Bob): workspace create/list/get, member add + owner-only enforcement (403 for non-owner rename, non-member read/write), owner-removal guard (400), project create/list (by a non-owner member), task create with a valid assignee, task create rejected for a non-member assignee (400), task update, unauthenticated access rejected (401), and workspace delete cascading to its projects/tasks (verified the children return 404 after) — then deleted the test users/data from the dev DB
- [x] Step 5 — Frontend shell: `/`, `/login`, `/register`, `/dashboard`, `/projects/[id]` as Server Components; `lib/session.ts` + `lib/server-fetch.ts` (cookie-forwarding reads), `lib/client-api.ts` (browser fetch with CSRF header injection); Redux Toolkit store (`store/`) with a per-request `makeStore()` factory (not a module singleton — avoids leaking state across users in the shared Next.js server process) and a `StoreHydrator` client boundary seeding `auth` state from the server-fetched user
- [x] `workspace.controller.ts`'s `getOne` now populates `owner`/`members` with `{ name, email }` (only there — membership checks elsewhere still compare raw ObjectIds) so the task-assignee dropdown can show member names
- [x] Verified live in the browser (not just curl): registered a fresh user, redirect-if-authenticated on `/login`/`/register` and redirect-if-unauthenticated on `/dashboard`, workspace creation, project creation, task creation with assignee dropdown, task status change persisting after `router.refresh()`, and logout — then cleaned the test user/workspace/project/task from the dev DB (left the human user's own test data untouched)
- [x] Switched `/projects/[id]` (and its `?workspace=` param) from raw ObjectIds to slugs per user request: `slug` field added to `Workspace`/`Project` (generated once at creation, `utils/slug.ts`), `middleware/membership.ts` now resolves either an id or a slug so no other call site needed to change, only the dashboard's `Link href`
- [x] Backfilled `slug` onto every pre-existing workspace/project (none had one before this change) and built the now-unique indexes only after backfilling — see `DECISIONS.md` for why the naive add-unique-field-then-index order silently failed
- [x] Discovered and fixed a real issue: `.env`'s `MONGO_URI` points at a remote Atlas cluster, not local `mongod` — every earlier session's "cleanup" via bare `mongosh` had been silently hitting the wrong (local, empty) database, leaving real test data live in Atlas the whole time. Re-ran all cleanup against the actual `MONGO_URI` (test1/Alice/Bob/QA-Tester users plus their workspaces/projects/tasks removed); the real user's own workspaces/projects were untouched throughout and now carry backfilled slugs
- [x] Verified live via curl against the real Atlas-backed API: creating a workspace/project by name returns a generated `slug`, and `GET /api/workspaces/:slug/projects/:slug` resolves correctly by slug — then cleaned that throwaway data up too

- [x] Step 6 — Socket.IO wiring: `backend/src/sockets/` (`index.ts` attaches to the shared HTTP server with an exact-Origin `allowRequest` guard, `auth.ts` verifies the httpOnly `accessToken` cookie at handshake, `handlers/project.handlers.ts` handles `project:join`/`project:leave` with membership check + acks, `types.ts`); graceful shutdown via `io.close()`. Frontend: `store/socketSlice.ts` + `store/socketMiddleware.ts` (sole Socket.IO client owner, per-store, auto re-join after reconnect), connection driven by `StoreHydrator`/`LogoutButton`, `components/projects/ProjectLiveStatus.tsx` "Live" badge on the project page. Documented in `docs/api/sockets.md`
- [x] Verified live via a scripted `socket.io-client` run against the real backend (12/12): rejected without cookie / with bad token / with foreign or missing Origin on both polling and websocket; member join/leave ok; slug, nonexistent project and non-member all rejected; join succeeds after being added as a member. Throwaway users/workspace cleaned from Atlas (by exact id + `s6test-` prefix)
- [x] Verified live in the browser: "Live" badge on a project page; forced a backend restart (`tsx watch`) → badge went "Reconnecting…" then back to "Live" with the room re-joined automatically; confirmed `accessToken` is not readable from page JS. Left the user's own "Step 6 Socket Test" / "Live Demo" workspace+project in place

- [x] Local Redis on Windows is **Memurai Developer 4.1.2** (Redis-compatible, Windows service `Memurai`, auto-start, port 6379), installed 2026-09-25. No `.env` change was needed. CLI: `"C:\Program Files\Memurai\memurai-cli.exe"`
- [x] Step 7: Real-time chat
  - Backend:
    - `models/Message.ts` (`{ project, _id }` index)
    - `validators/message.validators.ts`
    - `services/message.service.ts` (explicit `MessageDto`, `before`/`after` cursor paging)
    - `GET …/projects/:projectId/messages` (`routes/message.routes.ts`, `controllers/message.controller.ts`)
    - `sockets/handlers/message.handlers.ts` (`message:send`: zod validation, Redis rate limit via `utils/rateLimit.ts`, per-send membership re-check via the new shared `sockets/membership.ts`, broadcast `message:new` + ack with the saved message)
    - `maxHttpBufferSize` set to 64 KB
    - project/workspace deletes now cascade to messages
  - Frontend:
    - `store/messagesSlice.ts` (`createEntityAdapter`, one project at a time)
    - `socketMiddleware` handles `message:new` and `sendMessage`, with a typed `SocketDispatchExt` so `await dispatch(sendMessage())` returns the ack
    - `components/chat/ChatPanel.tsx` (server-fetched first page, "Load older", catch-up on every room (re)join, stick-to-bottom scrolling)
    - memoized `MessageBubble.tsx`
    - hooks moved to `.withTypes<>()`
  - Documented in `docs/api/messages.md` and `docs/api/sockets.md`
- [x] Verified live via a scripted run against the real backend (Atlas + Memurai), 30/30:
  - member send acked; broadcast reached the other member and the sender; an outsider not in the room received nothing
  - `<script>` text stored verbatim
  - rejected: empty text, 2001 chars (2000 accepted), invalid id, slug
  - non-member: send gets "Project not found"; history GET gets 403; unauthenticated GET gets 401
  - rate limit hit after 20 in the window, and it's per user
  - `before`/`after`/`limit` paging correct; `before`+`after` and `limit=51` get 400
  - a member removed from the workspace can't send while still in the room
  - workspace delete cascades to messages
  - throwaway `s7test-*` users and their workspace deleted from Atlas afterwards
- [x] Browser check of the chat UI, done with agent-browser driving two isolated browser sessions (two real throwaway accounts in one workspace): the second user's message appeared in the first user's chat without a reload, then the throwaway users/workspace/messages were deleted from Atlas.

- [x] Step 8: Typing & presence
  - Backend:
    - `sockets/presence.ts`: Redis hash per project (`presence:project:{projectId}`, field = userId, value = that user's socket count), `user:online` on 0 → 1 and `user:offline` on 1 → 0, 24 h TTL crash guard, disconnect cleanup over `socket.rooms`
    - `project:join` now registers presence and acks `{ ok: true, onlineUserIds }` (the online snapshot); `project:leave` unregisters it
    - `sockets/handlers/typing.handlers.ts`: `typing:start` (zod, Redis rate limit 30/10 s, per-event membership re-check, relayed via `socket.to(room)`) and `typing:stop` (no checks — it only clears an indicator)
    - `sockets/index.ts` registers the typing handlers and runs presence cleanup on disconnect; event types extended in `sockets/types.ts`
  - Frontend:
    - `store/presenceSlice.ts`: online + typing user ids for the open project, hydrated from the join ack, idempotent reducers, reset on disconnect/leave
    - `socketMiddleware` handles `user:online`/`user:offline`/`typing:start`/`typing:stop`, throttles outgoing typing (one start per 2.5 s, auto-stop after 3 s, stop on navigation), and expires peers' typing indicators after 3.5 s
    - `components/projects/PresenceList.tsx`: "Online now" list (green dot) resolved against the page's member list
    - `ChatPanel` shows "X is typing…" (aria-live) and dispatches typing commands on input change, send and unmount
  - Documented in `docs/api/sockets.md` and `DECISIONS.md`
- [x] Verified live via a scripted run against the real backend (Atlas + local Redis):
  - join ack returns the online snapshot; second member joining broadcasts `user:online` to the first
  - `typing:start` relayed to the other member (sender excluded); `typing:stop` clears it
  - multi-tab: second socket of the same user bumps the count without a second `user:online`; leaving one of two sockets fires nothing; the last socket fires `user:offline`; disconnect (not just leave) fires it too
  - non-member `typing:start` rejected ("Project not found"); invalid projectId rejected; typing rate limit hit after 30 starts in the window
  - throwaway `s8test-*` users and their workspace deleted from Atlas afterwards
- [x] Verified in a real browser (agent-browser, two isolated sessions with two real accounts in one workspace):
  - "Online now" showed the other member with a green dot on both sides; when one user navigated away, the other's list switched to "No one else is viewing this project right now." (Redis hash confirmed the decrement)
  - typing indicator "Browser B is typing…" appeared in user A's chat while B typed, and auto-cleared ~3 s after typing stopped
  - a message sent by B appeared in A's chat live (screenshots captured)
  - surfaced and fixed a real frontend bug the scripted test couldn't see: `presenceSlice` never consumed the join-ack snapshot — `presenceHydrated` was a dead action, so the online list stayed empty. It now hydrates from the `roomJoined` action's `onlineUserIds` payload (reducer removed)
  - test users/workspace/project/message deleted from Atlas afterwards

- [x] Step 9: Real-time task updates
  - Backend:
    - `sockets/emitter.ts`: the one place the REST layer reaches `io` — a nullable reference (`setIo`) plus typed `emitTaskCreated/Updated/Deleted`, so task controllers broadcast to `project:{projectId}` after a successful write (null before startup / after shutdown ⇒ skip, never throw)
    - `sockets/types.ts`: `ServerToClientEvents` gains `task:created`/`task:updated` (the task, same JSON as the REST response) and `task:deleted` (`{ projectId, taskId }`)
    - `server.ts`: `setIo(io)` after `createSocketServer`, `setIo(null)` after `io.close()`
    - `task.controller.ts`: emits after create/update/delete (delete captures ids before the doc is removed)
  - Frontend:
    - `store/tasksSlice.ts`: `createEntityAdapter` keyed by `_id`, newest-first; `tasksHydrated` merges (same project) / replaces (project switch), `taskUpserted`/`taskRemoved`, resets on `socketDisconnect`
    - `socketMiddleware` translates `task:created`/`task:updated`/`task:deleted` into store actions; `src/types/socket.ts` mirrors the new events
    - `components/tasks/TaskList.tsx` (live list, seeded from the server page, catch-up refetch on every (re)join) + `TaskCard.tsx` (memoized)
    - `CreateTaskForm` / `TaskStatusSelect` now dispatch the REST response into the store instead of `router.refresh()`; the status select uses a short-lived optimistic value so it doesn't snap back
    - project page passes canonical `project._id` to the task components (matching the socket room key)
  - Documented in `docs/api/tasks.md`, `docs/api/sockets.md`, and `DECISIONS.md`
- [x] Verified live via a scripted run against the real backend (Atlas + Redis), 22/22:
  - a task created/updated/deleted over REST as member A was broadcast to member B in the room as `task:created`/`task:updated`/`task:deleted`, with `task:created`/`task:updated` carrying the full task in the REST JSON shape (no `__v`) and `task:deleted` carrying `{ projectId, taskId }`
  - the actor's own socket also received the broadcast (self-broadcast, deduped client-side)
  - a connected socket that never joined the room received no task events
  - a foreign-Origin handshake is still rejected
  - throwaway `s9test-*` users and their workspace deleted from Atlas afterwards

- [x] Step 10: Real-time notifications
  - Backend:
    - `models/Notification.ts`: `{ recipient, actor, type, workspace, project, task?, message?, preview, read }`, indexed `{ recipient, read, createdAt }`
    - `services/notification.service.ts`: `NotificationDto`/`toDto` (populates actor name only), `notifyTaskAssigned` / `notifyTaskUpdated` (assignee-only, never the actor), `notifyNewMessage` (workspace members minus sender), `listNotifications` (newest 50 + real `unreadCount`), `markAllRead`
    - `sockets/types.ts`: `userRoom(userId)` + `notification:new` in `ServerToClientEvents`
    - `sockets/index.ts`: every connection joins `user:{userId}`; `sockets/emitter.ts`: `emitNotification(recipientId, …)`
    - `task.controller.ts` notifies after create/update (previous assignee read before the update); `message.handlers.ts` fans out after the ack (best-effort, `.catch(log)` — never fails the send)
    - `routes/notification.routes.ts` + `controllers/notification.controller.ts`: `GET /api/notifications`, `POST /api/notifications/read` (CSRF); mounted in `app.ts`
    - cascade: `deleteWorkspace` / `deleteProject` / `deleteTask` also delete notifications
  - Frontend:
    - `store/notificationsSlice.ts`: entity adapter (newest-first) + `unreadCount`; `notificationsHydrated` / `notificationReceived` (idempotent count) / `allMarkedRead`; resets on `socketDisconnect`
    - `socketMiddleware` handles `notification:new`; `src/types/socket.ts` mirrors it
    - `components/notifications/NotificationBell.tsx` (fetch on mount, badge, dropdown, mark-all-on-open, outside-click/Escape) + memoized `NotificationItem.tsx` (composed text + relative time, links by ids)
    - `AppHeader` renders the bell on every authenticated page
  - Documented in `docs/api/notifications.md`, `docs/api/sockets.md`, and `DECISIONS.md`
- [x] Verified live via a scripted run against the real backend (Atlas + Redis), 21/21:
  - B (not viewing the project) received `notification:new` for a task assigned to them, a task update, and a new message — each with the full DTO (actor name, preview, project/workspace ids, `read: false`)
  - the actor (A) received none of their own notifications; a non-member (C) received none
  - `GET /api/notifications` for B → `unreadCount` 3, newest-first; A → 0
  - unauthenticated `GET` → 401; `POST …/read` without CSRF → 403; with CSRF → 204 → `unreadCount` 0 and all `read`
  - workspace delete cascaded the notifications; `s10test-*` users removed from Atlas afterwards
- [x] Verified in a real browser (agent-browser), logged in as B on the dashboard:
  - the bell badge hydrated to `1` from `GET /api/notifications` on load
  - sending a message as A over the socket incremented B's badge to `2` live, with no reload (B was on `/dashboard`, not the project page)
  - opening the dropdown listed both items ("… sent a message: …" / "… assigned you …") with relative times and correct `/projects/:id?workspace=:id` links, and cleared the badge to 0 (mark-all-read)
  - throwaway `s10ui-*` users/workspace deleted from Atlas afterwards

- [x] Environment, 2026-10-17: the dev machine's Windows install changed, so Memurai was missing. Reinstalled Memurai Developer 4.1.2 (it needs an elevated MSI install; `winget --silent` fails with 1603). Added a git `safe.directory` exception because the repo folder is owned by the old install's account SID.
- [x] Step 11: Redis at scale
  - Caching (cache-aside, `utils/cache.ts`):
    - `cacheAside(key, ttl, load)`: Redis → else Mongo → store as JSON. Fails open to Mongo on Redis errors and never caches `null`. `invalidateCache(...keys)` runs after writes and logs on failure.
    - `cache:project:{id}:workspace` (5 min) via `project.service.getProjectWorkspaceId`
    - `cache:workspace:{id}:members` (60 s) via `workspace.service.getWorkspaceMemberIds`
    - `cache:user:{id}:workspaces` (5 min): `listWorkspacesForUser` now returns an explicit `WorkspaceSummary` (same JSON keys as before)
    - `sockets/membership.ts` `findProjectForMember` reads only those two cached values and returns a `ProjectRef` `{ _id, workspace }`. `createMessage` / `notifyNewMessage` take a `ProjectRef`, and `notifyNewMessage` reuses the cached member list.
    - Invalidation in the services: workspace create/rename/delete/add member/remove member, project delete (workspace delete also drops every child project's mapping)
  - Socket.IO Redis adapter:
    - `@socket.io/redis-adapter@8.3.0`, wired in `sockets/index.ts` via the `adapter` server option
    - `config/redis.ts`: dedicated `pubClient` / `subClient` (`redis.duplicate()`), connected and disconnected with the main client
  - Documented in `docs/api/workspaces.md` (list caching, immediate effect of member removal), `docs/api/sockets.md` ("Multiple backend instances") and `DECISIONS.md`. No new endpoints.
- [x] Verified live with two backend instances (`PORT=4001` + `PORT=4002`, Atlas + Memurai), 30/30:
  - adapter channels present in Redis (`PUBSUB CHANNELS socket.io*`)
  - A on 4001 and B on 4002 in the same project: `user:online`, the join snapshot (A + B), `message:new`, `notification:new` (user room), `typing:start`, and `task:created` from a REST write on 4001 all reached B on 4002
  - an outsider socket on 4001 received none of it
  - cache keys populated after a send; members TTL ≤ 60 s; workspace list cached, identical JSON from both instances, same key set as before
  - rename on 4002 → A's list on 4001 shows the new name immediately
  - removing B (on 4001) clears the member cache and B's list: B's `message:send` and `typing:start` on 4002 are rejected right away, and B's list drops the workspace. Re-adding B lets them send again immediately.
  - a new workspace shows in the owner's list right away; deleting a project clears its mapping and further sends to it are rejected
  - throwaway `s11test-*` users and their workspaces deleted from Atlas afterwards
  - `npm run typecheck:backend` passes

## Next Steps

1. **Step 12: Testing**: API integration tests, socket reconnect tests, key component tests.

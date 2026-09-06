# Project Progress

## Current State

Step 5 (Frontend shell) complete and verified live in the browser: register/login/dashboard/project pages working end-to-end against the real backend, including route protection, workspace/project/task creation, and task status updates.

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

## Next Steps

1. **Step 6 — Socket.IO wiring**: authenticated handshake, `project:{id}` rooms, connect/disconnect handling.

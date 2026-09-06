# Project Progress

## Current State

Step 4 (Workspace & Project CRUD) complete and verified live: full Workspace/Project/Task CRUD with membership-scoped authorization, tested end-to-end with two real users against the running dev server (see below), then cleaned from the dev DB.

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

## Next Steps

1. **Step 5 — Frontend shell**: `/login`, `/register`, `/dashboard`, `/projects/[id]` as Server Components; Redux store wired up. (Deferred by explicit choice — see `DECISIONS.md`.)

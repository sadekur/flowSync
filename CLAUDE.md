# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project

FlowSync — a real-time team collaboration platform (auth, workspaces/projects, tasks, chat, presence, notifications) built as a learning project for Socket.IO, Redis, and MongoDB on a Next.js + Express stack. It is being built one guideline step at a time (see `PLANNING.md`), pausing for review after each step — don't jump ahead to future steps unless asked.

Read these before making non-trivial changes:
- `PLANNING.md` — MVP scope and the 13 build steps (current step lives in `PROGRESS.md`)
- `DECISIONS.md` — the *why* behind architecture/security choices, recorded per step as it's built
- `PROGRESS.md` — what's done, what's next
- `docs/api/*.md` — per-endpoint API docs (add one per new route)

When you complete a step or make an architectural/security decision, update `PROGRESS.md` and `DECISIONS.md` accordingly, and add an API doc under `docs/api/` for any new endpoint — this is the established pattern, not optional cleanup.

A terse kickoff like "start" means: begin the next step listed under "Next Steps" in `PROGRESS.md`, and work out the plan for it from `PLANNING.md`. Before starting a new step, check that `docs/api/` still matches the implementation (routes, controllers, validators, services, middleware, socket handlers) and fix any drift first.

## Repo layout

Flat single-package repo — the Next.js app *is* the repo root, not a `frontend/` subfolder (Next.js requires its config co-located with the app).

```
flowSync/
├── package.json                # single manifest for both frontend and backend
├── .env / .env.example         # single env file for both apps (backend-only vars + NEXT_PUBLIC_* side by side)
├── tsconfig.json                # the ONLY tsconfig.json in the repo — it's Next's, excludes backend/
├── next.config.ts, postcss.config.mjs, eslint.config.mjs
├── src/, public/                # the Next.js app (App Router)
├── backend/src/                 # Express + Socket.IO API — no config file of its own (see below)
│   ├── config/                  # env.ts (dotenv+zod), db.ts (Mongoose), redis.ts (ioredis)
│   ├── controllers/, models/, routes/, services/, middleware/, validators/, utils/, types/
│   └── sockets/handlers/        # Socket.IO event handlers (added from Step 6 onward)
├── backend/tests/               # Vitest: setup/env.ts (test DB guard), helpers/ (server, api client, sockets), *.test.ts
├── src/test/                    # frontend test helpers: fakeSocket.ts, factories.ts, render.tsx (component tests sit next to the code as *.test.tsx)
├── vitest.config.mts            # two projects: backend (node, files serial) + frontend (jsdom)
├── vercel.json                  # Vercel Services: `web` (Next.js) + `api` (Express, entry backend/src/vercel.ts), both root "."
├── Dockerfile, docker-compose.yml, deploy/   # self-hosting: one image, Nginx (TLS + headers) in front, Mongo, Redis
└── docs/api/                    # one .md per REST endpoint
```

**The backend has three entry points, all built on `createHttpServer()` (`backend/src/httpServer.ts`), so they wire the app identically:**
- `server.ts` connects, then listens on `PORT`. Used by dev, `start:backend` and Docker.
- `vercel.ts` exports the `http.Server` for Vercel Functions and connects at module load.
- `backend/tests/helpers/server.ts` is the test harness.

Change the wiring in `httpServer.ts`, not in an entry.

`backend/` has **no `tsconfig.json`, no `package.json`**. `npm run build:backend` / `typecheck:backend` invoke `tsc` directly with compiler options as CLI flags, against a file list from `find backend/src -name '*.ts'` (see `package.json` scripts) — `find` is used instead of a shell glob because the POSIX `sh` npm scripts run under doesn't support `**`.

## Commands

Run from the repo root.

| Command | Purpose |
|---|---|
| `npm run dev:frontend` | Next.js dev server |
| `npm run dev:backend` | Express + Socket.IO dev server (`tsx watch backend/src/server.ts`) |
| `npm run build:frontend` | Production Next.js build |
| `npm run build:backend` | Compiles `backend/src/**/*.ts` → `backend/dist` (gitignored) |
| `npm run start:frontend` | Start built Next.js app |
| `npm run start:backend` | Run compiled backend (`node backend/dist/server.js`) |
| `npm run lint:frontend` | ESLint on `src/` only (backend is excluded — different runtime, see `eslint.config.mjs`) |
| `npm run typecheck:backend` | Same discovery/flags as `build:backend`, with `--noEmit` |
| `npm test` | Every test (Vitest, ~30 s). `test:backend` / `test:frontend` run one project, `test:watch` watches |
| `npm test -- backend/tests/auth.test.ts -t "duplicate email"` | One file, or one test by name |

**On Windows, `build:backend` / `typecheck:backend` need a POSIX script shell.** npm defaults to `cmd.exe` there, and those scripts then fail with `'f' is not recognized`. Run them as `npm run typecheck:backend --script-shell="$(which bash)"` from the Bash tool, or set it once with `npm config set script-shell "C:\Program Files\Git\bin\bash.exe"`.

There is no `lint:backend` or `typecheck:frontend`. For the frontend (and its `*.test.tsx`), use `npx tsc --noEmit -p tsconfig.json`. `typecheck:backend` covers only `backend/src`, not `backend/tests`.

**Deploying (Vercel project `sadekurs-projects/flowsync`, linked in `.vercel/`, connected to GitHub):**
- **Production deploys only from the `release` branch.** Run `git push origin master:release`, and production updates by itself.
- Every other branch is excluded by `git.deploymentEnabled: {"**": false, "release": true}` in `vercel.json`, so the auto-commit pushes to `master` never deploy.
- Never check out `release` and edit there: the auto-commit tool would deploy every save.
- Manual CLI deploys still work as a fallback:
- Use `npx vercel@65.12.1 …`, not the older global CLI, which predates Services.
- `vercel build --prod` reproduces the cloud build locally, and is the quickest check that `vercel.json` and the API entry still bundle.
- Then deploy with `vercel deploy --prod`.

Vercel's builder type-checks from the entry file, so any global `.d.ts` must be reachable from it (see the `/// <reference>` in `app.ts`). Production is live at https://flowsync-eight.vercel.app, with everything pinned to `bom1` (Mumbai) via `"regions"`. That's next to the Atlas M0 (GCP Mumbai) and the Upstash Redis; keep new resources in that region. Production env vars live in Vercel (`vercel env ls`): `MONGO_URI` (set by the user, for production and preview), `REDIS_URL` (Upstash Marketplace integration, free plan), and the JWT secrets as Secrets. `CORS_ORIGIN`, `COOKIE_DOMAIN` and `NEXT_PUBLIC_*` stay **unset** there: the deploy is same-origin.

**Tests never use `.env`'s database.** `backend/tests/setup/env.ts` points the backend at a local `mongodb://127.0.0.1:27017/flowsync_test` and Redis DB 15, wiping both before each test. It refuses to run against anything non-local, a database not named `*_test`, or Redis DB 0 (override with `TEST_MONGO_URI` / `TEST_REDIS_URL`). Backend tests start the real app via `backend/tests/helpers/server.ts`. Use `createFixture()` (owner + member + outsider sharing one workspace/project) and `helpers/sockets.ts` instead of hand-rolling cookies or socket headers. Frontend tests mock `socket.io-client` with `src/test/fakeSocket.ts` and `@/lib/client-api`'s `apiFetch`, around a real `makeStore()`. Under `NODE_ENV=test` (set only by that setup file), bcrypt uses cost 4.

Backend dev requires Redis running locally on port 6379 and a reachable MongoDB; `connectRedis()`/`connectDB()` in `backend/src/server.ts` fail fast and loudly on startup if either is unreachable. Where that Redis comes from depends on the dev machine:
- **Linux:** the `redis-server` systemd service (apt package). Check it with `systemctl is-active redis-server`, CLI `redis-cli`.
- **Windows:** **Memurai**, a Redis-compatible Windows service that auto-starts; CLI `"C:\Program Files\Memurai\memurai-cli.exe"`. If it's missing (e.g. after a Windows reinstall), install the MSI elevated: `winget install Memurai.MemuraiDeveloper --silent` fails with installer error 1603 without admin rights.

**How a step is verified:**
- `npm test`. Add tests for new behaviour alongside the code.
- Where it matters, a live run against the real dev backend (curl / scripted `socket.io-client`). Prefix throwaway users with something like `s7test-` so cleanup can match them exactly.
- A **browser check after every implementation** (the user's standing request), at least confirming the app still loads with no new console errors.

Browser automation must not register or log in accounts, so check the pages that need no login directly. Leave the logged-in pass to the user and mark it pending in `PROGRESS.md`.

**`MONGO_URI` in `.env` points at a remote Atlas cluster, not local `mongod`; production uses the same database.** A bare `mongosh` connects to the (empty) local instance — any inspection or cleanup of dev data must use `mongosh "$MONGO_URI"`. The Atlas DB also holds the human user's own workspaces/projects: when live-verifying a step, create throwaway users/data and delete only those afterwards.

## Architecture

```
Browser → Next.js (Server + Client Components) → Express API + Socket.IO → Redis (presence/cache/pub-sub) → MongoDB (persistent data)
```

- **MongoDB** — permanent data (users, workspaces, projects, tasks, messages, notifications) via Mongoose.
- **Redis** (`ioredis`, `lazyConnect: true`): presence, rate limiting, cache-aside, and the Socket.IO Redis adapter, which runs on its own `pubClient`/`subClient` in `config/redis.ts`. Presence lives *only* in Redis, never Mongo. All shared state is in Redis, never process memory, so any number of backend instances can run side by side (`PORT=4001 npx tsx backend/src/server.ts` starts a second one locally).
- **Caching** uses `cacheAside` / `invalidateCache` / `cacheKeys` from `backend/src/utils/cache.ts`. Cached values are plain JSON DTOs, never Mongoose docs. The service that does a Mongo write deletes every key it made stale, right after the write. If you add a write that changes workspace membership, a workspace list, or a project's existence, invalidate the matching keys. The socket membership check (`sockets/membership.ts`) reads from this cache, so a missed invalidation is a security bug, not just stale UI. REST loaders (`loadWorkspace` etc.) deliberately stay uncached.
- **Socket.IO** — real-time layer for chat, task updates, typing, presence, notifications; authenticated off the same httpOnly session cookie as the REST API. Server: `backend/src/sockets/` (`index.ts` wiring + exact-Origin check, `auth.ts` handshake auth, `handlers/*` per feature, `types.ts` event types, hand-mirrored in `src/types/socket.ts`). Client: `src/store/socketMiddleware.ts`. Event contract: `docs/api/sockets.md`. Rooms are keyed by ObjectId (`project:{_id}`), never slug.
- **Email** goes through `sendMail()` in `backend/src/utils/mailer.ts`:
  - **Transport:** nodemailer over SMTP. Dev uses `SMTP_URL`, the Mailtrap sandbox, which catches everything and delivers nothing. Production uses Resend's relay with `RESEND_API_KEY`.
  - **Tests:** mail is captured in `testOutbox`; read links from there.
  - **Templates** live in `utils/emails.ts`.
  - **Links** are built from `appUrl` (`config/env.ts`), never from the request's `Host`.
  - **Emailed tokens** are stored only as sha256 (`models/AuthToken.ts`), redeemed with an atomic `findOneAndDelete`, and sent in the URL fragment (`#token=`).
- **`http.createServer(app)`** is used in `server.ts` instead of `app.listen()` directly specifically so Socket.IO can attach to the same server later without touching that file.

### Backend request pipeline

`app.ts` mounts every router at `/api`. Each route is a chain of reusable middleware ahead of a thin controller → service:

`requireAuth` (verifies access-token cookie, sets `req.userId`) → `requireCsrf` (mutations only) → `asyncHandler(loadWorkspace | loadProject | loadTask)` (attaches the doc to `req`, 404 if missing) → `requireWorkspaceMember` / `requireWorkspaceOwner` → `asyncHandler(controller)` → `services/*`.

- Throw `ApiError(status, message)` (from `middleware/errorHandler.ts`) for expected failures; zod validators' `ZodError`s are turned into `400` with per-field `issues` by the same handler. Wrap every async handler/middleware in `asyncHandler`.
- Workspace/project URL params accept **either an ObjectId or a slug** — `idOrSlugFilter` in `middleware/membership.ts` resolves both, so routes and controllers don't care which the frontend linked to. Slugs are generated once at creation (`utils/slug.ts`) and never change on rename.
- `req.workspace` / `req.project` / `req.task` / `req.userId` are typed via `backend/src/types/express.d.ts`.
- Cascading deletes are done by hand with one `deleteMany` per child model in `services/workspace.service.ts`, `project.service.ts` and `task.service.ts`. When you add a model that references a workspace, project or task, add it to every cascade above it.

### Socket event pipeline

Socket handlers don't go through Express middleware, so each mutating handler repeats the same guards itself (see `sockets/handlers/message.handlers.ts`):

zod `safeParse` the payload → `isRateLimited(key, limit, windowSeconds)` (`utils/rateLimit.ts`, Redis-backed, per user across all sockets) → `findProjectForMember(projectId, userId)` (`sockets/membership.ts`, the socket version of `loadProject` + `requireWorkspaceMember`) → service call → `socket.nsp.to(projectRoom(id)).emit(...)` → `ack({ ok, ... })` wrapped in `safeAck`.

- Membership is re-checked on **every write**, not only at `project:join`, so a user removed from the workspace can't keep posting from a room they're still in.
- "Doesn't exist" and "not a member" get the same response (`Project not found`), so ids can't be probed.
- Broadcasts use namespace-level emit, so the sender's own tabs receive the event too. The client dedupes against the ack by `_id`.
- Socket handlers accept ObjectIds only, not slugs.
- Not every real-time event starts on a socket. Task create/update/delete are REST writes. `task.controller.ts` and `notification.service.ts` broadcast them through `sockets/emitter.ts` (`emitTaskCreated`, `emitNotification`, …). That module holds `io`, which `server.ts` registers with `setIo()` once the socket server exists, and it is `null` before then and after shutdown, so the broadcast is silently skipped. `task:*` payloads are the task's Mongoose `toJSON` (the same shape as the REST response), not a hand-written DTO. Notifications go to the per-user room `userRoom(id)`, which every socket joins at connection (`sockets/index.ts`), not to a project room.
- Services return explicit DTOs (e.g. `MessageDto`). Frontend copies of these shapes live in `src/types/api.ts` and `src/types/socket.ts` and are kept in sync by hand. Update both sides together.

### Frontend ↔ API

- **Server Components** read via `src/lib/server-fetch.ts` / `src/lib/session.ts`, which forward the incoming request's cookies to the Express API.
- **Client Components** call `apiFetch` in `src/lib/client-api.ts`: talks to `NEXT_PUBLIC_API_URL` directly with `credentials: "include"` and copies the `csrfToken` cookie into `X-CSRF-Token` on every non-GET — the client side of the double-submit check in `backend/src/middleware/csrf.ts`. After a mutation, pages refresh via `router.refresh()`.
- Redux store is created per request via `makeStore()` (`src/store/index.ts`), never a module singleton — a singleton would leak one user's state to another in the shared Next.js server process.
- **Dev is cross-origin, deploys are same-origin.** In dev, Next runs on :3000 and the API on :4000, using `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_SOCKET_URL`, `CORS_ORIGIN` and `COOKIE_DOMAIN=localhost`. On Vercel and docker-compose, one origin routes `/api` and `/socket.io` to the backend. There, all four are unset, the browser calls relative URLs, and cookies are host-only. Server Components still need an absolute URL, so `server-fetch.ts` uses `BACKEND_INTERNAL_URL` (the Vercel service binding or `http://api:4000`), falling back to `NEXT_PUBLIC_API_URL`. The socket Origin check (`isAllowedOrigin`) accepts `CORS_ORIGIN` *or* same-origin.
- The Socket.IO client is **WebSocket-only** (`transports: ["websocket"]`), because Vercel Functions can't serve long-polling. On Vercel, sockets also drop at the function's max duration, and the reconnect / re-join / catch-up path handles it.

### Security model (enforced incrementally as each piece is built — see `DECISIONS.md` for full rationale)

- Auth: JWT access (~15m) + refresh (~7d) as `httpOnly` + `Secure` + `SameSite=Strict` cookies only — never in a JSON body or `localStorage`. Redux only ever holds the decoded user profile, never a raw token.
- State-changing REST routes need CSRF protection beyond `SameSite=Strict` (custom header, e.g. `X-CSRF-Token` double-submit).
- `helmet` CSP (`default-src 'self'`, `frame-ancestors 'none'`, no `unsafe-inline`/`unsafe-eval`) + equivalent headers repeated at Nginx in prod (Step 13) as defense in depth.
- CORS allowlists exactly `CORS_ORIGIN`, `credentials: true`, never a wildcard.
- Secrets stay backend-`.env`-only; only `NEXT_PUBLIC_*` vars reach the frontend bundle — never put a secret-shaped value in one.
- File storage (post-MVP): bucket stays private; all upload/download proxies through the backend or uses short-lived pre-signed URLs. Never expose bucket credentials to the client.

### Frontend conventions (from Step 5 onward)

- Route segments are Server Components fetching with the forwarded httpOnly cookie; a thin `StoreHydrator` client boundary seeds Redux from server-fetched props.
- Redux Toolkit owns auth/UI/real-time-synced entities; `createEntityAdapter` normalizes tasks/messages/notifications by id.
- A single `socketMiddleware` is the only code that touches the Socket.IO client, translating server events into dispatched actions.
- List-item presentational components (`TaskCard`, `MessageBubble`, etc.) are `React.memo`-wrapped so socket-driven updates don't cascade into full-list re-renders.

## Conventions specific to this repo

- One root `package.json`, one root `.env`/`.env.example`, one `tsconfig.json` for the whole repo — do not create a second one anywhere (including inside `backend/`).
- `next.config.ts` and `backend/src/config/env.ts` each independently load the root `.env` via `dotenv` with `quiet: true` (suppresses dotenv's promotional console tip; verified benign against the public npm registry hash) — keep both loaders if you touch either file.
- `backend/src/config/env.ts` validates `process.env` with a `zod` schema and calls `process.exit(1)` with a per-field message on failure — extend this schema (not ad-hoc `process.env` reads) when adding new required env vars, and update `.env.example` in the same change.
- Every file change in this repo is auto-committed and pushed to `github.com/sadekur/flowSync` by a tool outside this session — this is expected/intentional, not something to investigate or undo.

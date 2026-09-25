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
├── backend/tests/
└── docs/api/                    # one .md per REST endpoint
```

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

There is no `lint:backend`, `typecheck:frontend` (use the IDE/`tsc --noEmit` via Next's own tsconfig), or test script yet — tests arrive at Step 12 (`PLANNING.md`). Backend dev requires Redis running locally (on the Windows dev machine that's **Memurai**, a Redis-compatible Windows service on port 6379 that auto-starts; CLI `"C:\Program Files\Memurai\memurai-cli.exe"`) and a reachable MongoDB; `connectRedis()`/`connectDB()` in `backend/src/server.ts` fail fast and loudly on startup if either is unreachable.

**`MONGO_URI` in `.env` points at a remote Atlas cluster, not local `mongod`.** A bare `mongosh` connects to the (empty) local instance — any inspection or cleanup of dev data must use `mongosh "$MONGO_URI"`. The Atlas DB also holds the human user's own workspaces/projects: when live-verifying a step, create throwaway users/data and delete only those afterwards.

## Architecture

```
Browser → Next.js (Server + Client Components) → Express API + Socket.IO → Redis (presence/cache/pub-sub) → MongoDB (persistent data)
```

- **MongoDB** — permanent data (users, workspaces, projects, tasks, messages, notifications) via Mongoose.
- **Redis** (`ioredis`, `lazyConnect: true`) — presence, cache-aside for hot reads, rate-limiting, and eventually the Socket.IO adapter for multi-instance pub/sub. Presence lives *only* in Redis, never Mongo.
- **Socket.IO** — real-time layer for chat, task updates, typing, presence, notifications; authenticated off the same httpOnly session cookie as the REST API. Server: `backend/src/sockets/` (`index.ts` wiring + exact-Origin check, `auth.ts` handshake auth, `handlers/*` per feature, `types.ts` event types, hand-mirrored in `src/types/socket.ts`). Client: `src/store/socketMiddleware.ts`. Event contract: `docs/api/sockets.md`. Rooms are keyed by ObjectId (`project:{_id}`), never slug.
- **`http.createServer(app)`** is used in `server.ts` instead of `app.listen()` directly specifically so Socket.IO can attach to the same server later without touching that file.

### Backend request pipeline

`app.ts` mounts every router at `/api`. Each route is a chain of reusable middleware ahead of a thin controller → service:

`requireAuth` (verifies access-token cookie, sets `req.userId`) → `requireCsrf` (mutations only) → `asyncHandler(loadWorkspace | loadProject | loadTask)` (attaches the doc to `req`, 404 if missing) → `requireWorkspaceMember` / `requireWorkspaceOwner` → `asyncHandler(controller)` → `services/*`.

- Throw `ApiError(status, message)` (from `middleware/errorHandler.ts`) for expected failures; zod validators' `ZodError`s are turned into `400` with per-field `issues` by the same handler. Wrap every async handler/middleware in `asyncHandler`.
- Workspace/project URL params accept **either an ObjectId or a slug** — `idOrSlugFilter` in `middleware/membership.ts` resolves both, so routes and controllers don't care which the frontend linked to. Slugs are generated once at creation (`utils/slug.ts`) and never change on rename.
- `req.workspace` / `req.project` / `req.task` / `req.userId` are typed via `backend/src/types/express.d.ts`.

### Frontend ↔ API

- **Server Components** read via `src/lib/server-fetch.ts` / `src/lib/session.ts`, which forward the incoming request's cookies to the Express API.
- **Client Components** call `apiFetch` in `src/lib/client-api.ts`: talks to `NEXT_PUBLIC_API_URL` directly with `credentials: "include"` and copies the `csrfToken` cookie into `X-CSRF-Token` on every non-GET — the client side of the double-submit check in `backend/src/middleware/csrf.ts`. After a mutation, pages refresh via `router.refresh()`.
- Redux store is created per request via `makeStore()` (`src/store/index.ts`), never a module singleton — a singleton would leak one user's state to another in the shared Next.js server process.

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

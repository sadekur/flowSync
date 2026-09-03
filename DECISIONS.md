# Design Decisions

## Repo structure

- Flat single-package repo: the Next.js app lives at the repo root (`src/`, `public/`, `next.config.ts`, `tsconfig.json`, `postcss.config.mjs`, `eslint.config.mjs`) — Next.js requires its config co-located with the app it builds, so there's no separate `frontend/` folder. `backend/` is the only subfolder.
- One root `package.json` for both apps, one root `.env.example`/`.env` (backend-only vars and `NEXT_PUBLIC_*` vars side by side, documented as such), one `tsconfig.json` in the whole repo (Next's).
- `backend/` has no config file of its own. `build:backend`/`typecheck:backend` run `tsc` with compiler options as CLI flags against a file list from `find backend/src -name '*.ts'` (guarded: prints a placeholder instead of erroring while `backend/src/` is empty). `find` instead of a shell glob because POSIX `sh` (what npm scripts run under) doesn't support recursive `**`.
- `next.config.ts` loads the root `.env` via `dotenv` (`quiet: true` — suppresses a benign but noisy self-promotional string the package prints by default; verified against the public npm registry hash, no outbound network code in the package).
- Redis for local dev: native `apt install redis-server`, not Docker. Docker Compose is still the Step 13 production target.
- Execution cadence: one guideline step at a time, pausing for review/testing after each.
- Every file change in this repo is auto-committed and pushed to `github.com/sadekur/flowSync` by a tool outside this session (not something run here) — confirmed intentional by the user.

## Security & architecture principles (enforced as each piece is built)

- **Auth tokens**: JWT access (~15m) + refresh (~7d), both `httpOnly` + `Secure` + `SameSite=Strict` cookies set by the backend — never in a JSON response body, never in `localStorage`/Redux. Redux only ever holds the decoded user profile, never a raw token.
- **CSRF**: cookie-based auth needs a second layer beyond `SameSite=Strict` — state-changing REST routes require a custom header (`X-CSRF-Token` double-submit, or `X-Requested-With`) that a cross-site form/script can't attach.
- **Clickjacking/CSP**: `frame-ancestors 'none'` + `X-Frame-Options: DENY`, strict `Content-Security-Policy` (`default-src 'self'`, no `unsafe-inline`/`unsafe-eval`, nonce for any unavoidable inline script), `X-Content-Type-Options: nosniff`, restrictive `Permissions-Policy` — set in Next.js middleware, repeated at Nginx in prod (Step 13) as defense in depth.
- **CORS**: backend allowlists exactly the frontend origin, `credentials: true`, no wildcard.
- **Secrets**: only ever in backend `.env` reads; the frontend build only consumes `NEXT_PUBLIC_*` values. No secret-shaped value is allowed into a `NEXT_PUBLIC_*` var.
- **File storage** (post-MVP feature, principle fixed now): bucket stays private, never reachable directly by the client. All upload/download traffic goes through the backend, which proxies the bytes or issues short-lived scoped pre-signed URLs. Bucket credentials are backend-only secrets.
- **Caching**: Redis cache-aside on hot read endpoints with explicit invalidation on writes; presence lives only in Redis (never Mongo); Next.js server-component `fetch` calls set explicit `cache`/`revalidate` per route rather than relying on defaults.
- **State management**: Redux Toolkit owns auth/UI/real-time-synced entities; `createEntityAdapter` normalizes tasks/messages/notifications by id; a single `socketMiddleware` is the only thing that touches the Socket.IO client, translating server events into dispatched actions.
- **Server/Client components**: route segments are Server Components fetching with the forwarded httpOnly cookie; a thin `StoreHydrator` client boundary seeds Redux from server-fetched props; everything interactive is a Client Component; list-item presentational components (`TaskCard`, `MessageBubble`, etc.) are `React.memo`-wrapped to keep socket-driven updates from cascading into full-list re-renders.

## Step 2 — Backend bootstrap

- **Express 5**, not 4 — current npm-resolved default, and its native handling of rejected promises in route handlers is a nice bonus. `asyncHandler` is still used explicitly for clarity rather than relying on that.
- **Env loading**: `backend/src/config/env.ts` loads the root `.env` via `dotenv` (mirrors `next.config.ts`) and validates it through a `zod` schema, failing fast with a clear per-field message and `process.exit(1)` if anything required is missing/malformed — rather than surfacing a confusing error deep inside a request handler later.
- **Redis client**: `ioredis`, with `lazyConnect: true` — connects explicitly in `server.ts` so startup fails fast (and loudly) if Redis is unreachable, instead of the app silently coming up "half-working."
- **`http.createServer(app)`** in `server.ts` instead of `app.listen()` directly — no behavior difference yet, but lets Step 6 attach Socket.IO to the same server without touching this file.
- **`GET /api/health`**: checks live `mongoose.connection.readyState` and a real Redis `PING`, returns `200`/`ok` or `503`/`degraded` — verified: fails fast with a clear error when Redis is down (confirmed with Redis not yet installed), and needs a real run against both services connected to confirm `200`.

Full step-by-step build plan lives in `PLANNING.md`.

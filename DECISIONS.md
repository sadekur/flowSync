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
- **`GET /api/health`**: checks live `mongoose.connection.readyState` and a real Redis `PING`, returns `200`/`ok` or `503`/`degraded` — verified both paths live: fails fast with a clear error when Redis is down, and returns `200 ok` with both services connected once Redis was installed.

## Step 3 — Authentication

- **Password hashing**: `bcryptjs` (pure JS, not native `bcrypt`) — no native build step needed, one less thing to break across environments; cost factor 12. `passwordHash` has `select: false` on the schema so a stray `User.find()` never leaks it — login explicitly `.select("+passwordHash")`s it back.
- **Token rotation**: every successful register/login/refresh reissues *all three* cookies (access, refresh, CSRF) rather than only the expired one — simpler client mental model (one cookie set = one logical session) and avoids a stale CSRF token outliving the refresh token it's meant to protect.
- **`tokenVersion` on `User`**: embedded in the refresh token payload and compared on every refresh. Not used yet (nothing bumps it), but it's the mechanism for a future "log out everywhere" / forced-invalidation on password change, without needing a server-side token blocklist.
- **CSRF — double-submit, not a session store**: `csrfToken` is a random value set as a **non-`httpOnly`** cookie; `POST /api/auth/refresh` and `POST /api/auth/logout` require it echoed back in an `X-CSRF-Token` header, checked by a new reusable `middleware/csrf.ts`. `register`/`login` are exempt — pre-session, so there's no cookie yet for a forged request to piggyback on, and the requests aren't acting on an existing account. Every future mutating route (Step 4+) should apply the same middleware rather than reinventing CSRF handling.
- **Logout doesn't revoke tokens server-side**: it only clears the three cookies. A stolen access token would still work for its remaining ~15m regardless of logout — acceptable for the MVP; `tokenVersion` bump is the documented upgrade path if that's ever not acceptable.
- **`errorHandler` gained `ZodError` handling** (400 + per-field `issues` array) — the validators (`validators/auth.validators.ts`) call `schema.parse()` directly in the controller rather than a validation middleware, so the shared error handler is what turns a thrown `ZodError` into a client-usable response.
- **Cookie `maxAge` derived from env, not hardcoded**: `utils/cookies.ts` runs `JWT_ACCESS_EXPIRES_IN`/`JWT_REFRESH_EXPIRES_IN` (already-validated env strings like `"15m"`/`"7d"`) through the `ms` package (already a transitive dep of `jsonwebtoken`; added as a direct dependency since it's now imported directly) so the cookie lifetime always matches the actual JWT lifetime with one source of truth.

## Step 4 — Workspace & Project CRUD

- **Permission model kept deliberately flat**, per PLANNING.md's "complex permissions" out-of-scope note: a workspace has one `owner` (creator) plus a `members` array the owner is always included in. Only the owner can rename/delete the workspace or manage membership; *any* member can create/read/update/delete every project and task inside it — no per-project roles, no "creator can edit, others can't." Simplest thing that lets multiple people collaborate; can be layered on later without a schema migration (roles would just replace the flat `members: ObjectId[]` with `members: { user, role }[]`).
- **Membership middleware over per-controller checks**: `middleware/membership.ts` exports composable pieces (`loadWorkspace` → `requireWorkspaceMember`/`requireWorkspaceOwner` → `loadProject` → `loadTask`) chained directly in the route definitions (see `routes/*.routes.ts`), rather than re-checking membership inside each controller. Keeps the authorization rule visible at the route declaration, not buried in service code.
- **Flat route files, not nested Express routers**: `project.routes.ts`/`task.routes.ts` each declare their full literal path (`/workspaces/:workspaceId/projects/...`) and mount at `/api` directly, same pattern as `auth.routes.ts`, instead of `Router({ mergeParams: true })` sub-mounting. One less layer of indirection for three routers total.
- **Task's `workspace` field is denormalized** from `project.workspace` — set once at task creation from the already-loaded `req.workspace`. Avoids an extra `Project` lookup on every task read/membership check; the tradeoff (an extra field to keep in sync) never actually needs syncing since tasks aren't moved between projects in the MVP.
- **Assignee must already be a workspace member** (checked in `task.service.ts`), enforced at write time rather than via a schema-level constraint — Mongoose can't express "must be in this other document's array" declaratively.
- **Cascading deletes are explicit, not Mongoose middleware hooks** (`workspace.service.ts`/`project.service.ts` delete children before the parent): keeps the deletion order visible in one place instead of hidden in a `pre("deleteOne")` hook on three different models.
- **Frontend (Step 5) deliberately not started alongside this step**: asked and confirmed with the user rather than building a quick login/register UI to exercise Step 3 early — PLANNING.md's order (backend CRUD fully done first) stands.

Full step-by-step build plan lives in `PLANNING.md`.

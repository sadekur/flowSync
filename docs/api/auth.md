# Auth

**Implemented.** Cookie-based auth: JWT access (`accessToken`, ~15m) and refresh (`refreshToken`, ~7d) tokens are set as `httpOnly` + `Secure`(prod) + `SameSite=Strict` cookies — never returned in a response body. A parallel non-`httpOnly` `csrfToken` cookie is issued alongside them for the double-submit CSRF check (see below). All three cookies are scoped to `COOKIE_DOMAIN` and rotate together on every successful register/login/refresh.

## CSRF

`POST /api/auth/refresh` and `POST /api/auth/logout` require header `X-CSRF-Token` to match the `csrfToken` cookie value, or they respond **403**. `register`/`login` are exempt — no session exists yet for a forged cross-site request to ride along on. This same `requireCsrf` middleware (`backend/src/middleware/csrf.ts`) is intended for reuse on future state-changing routes (workspaces/projects/tasks, Step 4+).

## `POST /api/auth/register`

Body: `{ "name": string, "email": string, "password": string (min 8) }`

- **201** — sets auth cookies, returns `{ "user": { ...profile, no passwordHash } }`
- **409** — email already in use
- **400** — validation failed, `{ "error": "Validation failed", "issues": [{ "path", "message" }] }`

## `POST /api/auth/login`

Body: `{ "email": string, "password": string }`

- **200** — sets auth cookies, returns `{ "user": {...} }`
- **401** — invalid email or password
- **400** — validation failed (same shape as register)

## `POST /api/auth/refresh`

No body. Reads `refreshToken` cookie, requires `X-CSRF-Token`.

- **200** — rotates all three cookies, returns `{ "user": {...} }`
- **401** — missing/invalid/expired refresh token, or the user's `tokenVersion` no longer matches (e.g. after a future "log out everywhere")
- **403** — missing/invalid CSRF token

## `POST /api/auth/logout`

No body. Requires `X-CSRF-Token`. Clears all three cookies — does not currently revoke the still-valid access/refresh tokens server-side (no blocklist yet; access tokens expire in ~15m regardless).

- **204** — always, given a valid CSRF token
- **403** — missing/invalid CSRF token

## `GET /api/auth/me`

Requires a valid `accessToken` cookie.

- **200** — `{ "user": {...} }`
- **401** — not authenticated / token invalid or expired

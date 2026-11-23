# Auth

**Implemented.** Cookie-based auth: JWT access (`accessToken`, ~15m) and refresh (`refreshToken`, ~7d) tokens are set as `httpOnly` + `Secure`(prod) + `SameSite=Strict` cookies — never returned in a response body. A parallel non-`httpOnly` `csrfToken` cookie is issued alongside them for the double-submit CSRF check (see below). All three cookies are scoped to `COOKIE_DOMAIN` and rotate together on every successful register/login/refresh.

## CSRF

`POST /api/auth/refresh`, `POST /api/auth/logout` and `POST /api/auth/resend-verification` require header `X-CSRF-Token` to match the `csrfToken` cookie value, or they respond **403**. `register`/`login`/`forgot-password`/`reset-password`/`verify-email` are exempt — no session is involved for a forged cross-site request to ride along on (the emailed links' token is the credential).

## The user object

Every `{ "user": {...} }` below is the profile: `_id`, `name`, `email`, `tokenVersion`, `emailVerifiedAt` (ISO date, or `null` until the email is verified), `createdAt`, `updatedAt`. Never `passwordHash`. An unverified account can do everything a verified one can; the app only shows a banner. This same `requireCsrf` middleware (`backend/src/middleware/csrf.ts`) is intended for reuse on future state-changing routes (workspaces/projects/tasks, Step 4+).

## `POST /api/auth/register`

Body: `{ "name": string, "email": string, "password": string (min 8) }`

- **201** — sets auth cookies, returns `{ "user": { ...profile, emailVerifiedAt: null } }`, and emails a verification link (see `verify-email`). A failed send is logged, not reported: the account exists either way, and the banner's resend is the retry.
- **409** — email already in use
- **400** — validation failed, `{ "error": "Validation failed", "issues": [{ "path", "message" }] }`

## `POST /api/auth/login`

Body: `{ "email": string, "password": string }`

- **200** — sets auth cookies, returns `{ "user": {...} }`
- **401** — invalid email or password
- **400** — validation failed (same shape as register)

## `POST /api/auth/forgot-password`

Body: `{ "email": string }`. No auth, no CSRF (no session is involved).

If an account has that email, emails it a single-use reset link: `{APP_URL}/reset-password#token=<token>`. The link is valid for 30 minutes, and requesting a new one retires the previous one. The token sits in the URL **fragment**, which browsers never send to a server, so it stays out of request logs and `Referer` headers. Only its sha256 is stored (`AuthToken`, deleted by a TTL index after it expires).

- **200** — `{ "message": "If an account exists for that email, a reset link is on its way." }`, whether or not the account exists. A failed send is logged, not reported.
- **429** — more than 3 requests for the same email in an hour. Counted before the account lookup, so unknown emails are limited the same way.
- **400** — validation failed (not an email)

## `POST /api/auth/reset-password`

Body: `{ "token": string, "password": string (min 8) }`. No auth, no CSRF: the token is the credential.

- **200** — `{ "message": "Password updated. Log in with your new password." }`. The token is used up (atomically, so two racing requests can't both win), and the user's `tokenVersion` is bumped, so every existing session's refresh token stops working; access tokens expire within ~15 min. If this browser's cookies belong to the same account, they are cleared too; a different account's session in the same browser is left alone. The user is **not** logged in.
- **400** — `{ "error": "This reset link is invalid or has expired. Request a new one." }` for an unknown, used, superseded or expired token; or a validation failure (e.g. a short password), which does not use the token up

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

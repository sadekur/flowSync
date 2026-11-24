# Auth

**Implemented.** Cookie-based auth: JWT access (`accessToken`, ~15m) and refresh (`refreshToken`, ~7d) tokens are set as `httpOnly` + `Secure`(prod) + `SameSite=Strict` cookies — never returned in a response body. A parallel non-`httpOnly` `csrfToken` cookie is issued alongside them for the double-submit CSRF check (see below). All three cookies are scoped to `COOKIE_DOMAIN` and rotate together on every successful register/login/refresh.

## CSRF

`POST /api/auth/refresh`, `POST /api/auth/logout` and `POST /api/auth/resend-verification` (and `POST /api/invites/accept`, see `docs/api/invites.md`) require header `X-CSRF-Token` to match the `csrfToken` cookie value, or they respond **403**. `register`/`login`/`forgot-password`/`reset-password`/`verify-email` are exempt — no session is involved for a forged cross-site request to ride along on (the emailed links' token is the credential).

## The user object

Every `{ "user": {...} }` below is the profile: `_id`, `name`, `email`, `tokenVersion`, `emailVerifiedAt` (ISO date, or `null` until the email is verified), `createdAt`, `updatedAt`. Never `passwordHash`. An unverified account can do everything a verified one can; the app only shows a banner. This same `requireCsrf` middleware (`backend/src/middleware/csrf.ts`) is intended for reuse on future state-changing routes (workspaces/projects/tasks, Step 4+).

## `POST /api/auth/register`

Body: `{ "name": string, "email": string, "password": string (min 8), "inviteToken"?: string }`

- **201** — sets auth cookies, returns `{ "user": { ...profile, emailVerifiedAt: null } }`, and emails a verification link (see `verify-email`). A failed send is logged, not reported: the account exists either way, and the banner's resend is the retry.
- With `inviteToken` (from a workspace invite link, see `docs/api/invites.md`), the response also has `workspace` and `inviteError`:
  - If the invite is live and addressed to this `email`, the account joins that workspace and starts **verified** (the token came from the inbox). `workspace` is `{ _id, name, slug }`, `inviteError` is `null`, and no verification email is sent.
  - Otherwise the account is still created as usual (unverified, verification email sent). `workspace` is `null` and `inviteError` says why, e.g. the 400/403 messages of `POST /api/invites/accept`. The invite is left untouched.
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

- **200** — `{ "message": "Password updated. Log in with your new password." }`. The token is used up (atomically, so two racing requests can't both win), and the user's `tokenVersion` is bumped, so every existing session's refresh token stops working; access tokens expire within ~15 min. If this browser's cookies belong to the same account, they are cleared too; a different account's session in the same browser is left alone. The user is **not** logged in. The email also counts as verified (`emailVerifiedAt` is set if it wasn't), since the link reached the inbox.
- **400** — `{ "error": "This reset link is invalid or has expired. Request a new one." }` for an unknown, used, superseded or expired token (including a verification token: each token only works for the purpose it was mailed for); or a validation failure (e.g. a short password), which does not use the token up

## `POST /api/auth/verify-email`

Body: `{ "token": string }`. No auth, no CSRF: the token is the credential, and the link may be opened on a device that isn't logged in.

The token comes from the link emailed at registration (or by `resend-verification`): `{APP_URL}/verify-email#token=<token>`, valid for 24 hours, in the URL fragment and stored only as a sha256, like reset links. The `/verify-email` page posts it only when the user clicks **Confirm my email**, not on load, so a mail scanner that opens the link can't verify the address.

- **200** — `{ "message": "Email verified." }`. The token is used up atomically. `emailVerifiedAt` is set; if it was already set, it keeps the first time.
- **400** — `{ "error": "This verification link is invalid or has expired. Log in to get a new one." }` for an unknown, used, superseded, expired or reset token; or a validation failure (missing token)

## `POST /api/auth/resend-verification`

No body. Requires a session (`accessToken` cookie) and `X-CSRF-Token`. Emails a new verification link to the logged-in user and retires the previous one.

- **200** — `{ "message": "Verification email sent." }`
- **400** — `{ "error": "Your email is already verified." }`
- **401** — not authenticated
- **403** — missing/invalid CSRF token
- **429** — more than 3 resends by this user in an hour
- **503** — the email couldn't be sent (SMTP failure; details are in the server log). Unlike registration, the user asked for this email, so the failure is reported.

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

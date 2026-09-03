# FlowSync — Planning

## Goal

Build a small real-time team collaboration platform to learn and practice Socket.IO, Redis, MongoDB, and modern full-stack development (source: `DevFlow_Minimal_Development_Guideline.pdf`).

## MVP feature scope

Authentication · Workspace · Project · Task Management · Team Members · Real-Time Chat · Typing Indicator · Online/Offline Status · Real-Time Notifications · Redis · MongoDB · Socket.IO

**Explicitly out of scope for the MVP** (per the guideline): file uploads, advanced analytics, email systems, complex permissions. These can be layered on once the MVP is stable — see the file-storage security principle in `DECISIONS.md` for how uploads should be added later without exposing a bucket.

## Architecture

```
Browser → Next.js (Server + Client Components) → Express API + Socket.IO → Redis (presence/cache/pub-sub) → MongoDB (persistent data)
```

- **MongoDB** — permanent application data (users, workspaces, projects, tasks, messages, notifications).
- **Redis** — presence, cache-aside for hot reads, rate-limit store, and (at scale) the Socket.IO adapter for multi-instance pub/sub.
- **Socket.IO** — real-time delivery layer for chat, task updates, typing, presence, and notifications, authenticated off the same httpOnly session cookie as the REST API.

Full rationale for auth/token handling, CSRF, CSP/clickjacking headers, CORS, secrets, file-storage bucket policy, caching, Redux state shape, and the Server/Client component split lives in `DECISIONS.md` (recorded as each piece is built, not speculatively up front).

## Development principle

First build the normal CRUD application → then add Socket.IO → then add Redis → finally deploy. Keep the MVP focused — resist scope creep until it's stable.

## Build steps

Executed one at a time; each step ends with working code plus a `DECISIONS.md`/`PROGRESS.md` update, then pauses for review before the next step starts.

1. **Project Setup** — repo scaffold (this step): Next.js app at the root, `backend/`, root env/config, docs.
2. **Backend bootstrap** — Express + TS, Mongoose + Redis connections, JWT util, security middleware, `GET /api/health`.
3. **Authentication** — register/login/logout/refresh/me via JWT httpOnly cookies.
4. **Workspace & Project CRUD** — User/Workspace/Project/Task models + membership-scoped REST APIs.
5. **Frontend shell** — `/login`, `/register`, `/dashboard`, `/projects/[id]` as Server Components; Redux store wired up.
6. **Socket.IO wiring** — authenticated handshake, `project:{id}` rooms, connect/disconnect handling.
7. **Real-time chat** — `message:send` / `message:new`, persisted + broadcast.
8. **Typing & presence** — `typing:start/stop`, `user:online/offline` backed by Redis.
9. **Real-time task updates** — task mutations broadcast to the project room.
10. **Notifications** — task-assigned/updated and new-message notifications, stored + pushed live.
11. **Redis at scale** — formalize caching, add the Socket.IO Redis adapter.
12. **Testing** — API integration tests, socket reconnect tests, key component tests.
13. **Deployment** — Docker Compose (frontend, backend, mongo, redis, nginx).

## Production architecture (Step 13 target)

```
User → Nginx (TLS + security headers) → Next.js → Node.js + Socket.IO → Redis / MongoDB
```

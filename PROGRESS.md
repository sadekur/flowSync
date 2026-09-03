# Project Progress

## Current State

Step 1 (Project Setup) complete. No backend server exists yet — `npm run dev:backend` is a placeholder until Step 2. Verify the frontend with `npm run lint:frontend` and `npm run build:frontend`; verify the backend config resolves with `npm run typecheck:backend` (currently reports "no inputs" — expected, there's no `.ts` source yet).

## Completed

- [x] Repo scaffolded as a single-package monorepo: `frontend/` (Next.js 16, App Router, TS, Tailwind v4, ESLint) via `create-next-app`, `backend/` (empty `src/` structure: `config`, `models`, `routes`, `controllers`, `services`, `middleware`, `sockets/handlers`, `validators`, `utils`, `types`, `tests`) hand-scaffolded
- [x] One root `package.json` (all deps + scripts), one root `tsconfig.base.json` shared by `frontend/tsconfig.json` and `backend/tsconfig.json` (each `extends` it), one root `.env.example` covering both apps — see `DECISIONS.md` for why each of these is one file instead of per-app
- [x] Root `.gitignore` covering `node_modules/`, `frontend/.next/`, `backend/dist/`, `.env`, logs
- [x] `frontend/next.config.ts` loads the root `.env` via `dotenv` (Next doesn't auto-load env files outside its own project directory) — verified live: `injected env (11) from ../.env`
- [x] `npm run lint:frontend` clean (0 errors), `npm run build:frontend` succeeds (static export of the default Next.js starter page)
- [x] `PLANNING.md`, `DECISIONS.md`, `PROGRESS.md`, `README.md` seeded

## Next Steps

1. **Step 2 — Backend bootstrap**: Express + TS entrypoint (`backend/src/app.ts` + `server.ts`), Mongoose connection (`config/db.ts`), Redis client (`config/redis.ts`), JWT util, `helmet`/CORS/cookie-parser + security-header middleware, `GET /api/health` (checks Mongo + Redis reachability). Replaces the `dev:backend` placeholder script.
2. **Before Step 2 can be verified end-to-end**: Redis needs to be installed locally (`sudo apt install redis-server`, confirmed as the chosen approach) — not yet done.

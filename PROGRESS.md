# Project Progress

## Current State

Step 1 (Project Setup) complete. No backend server exists yet — `npm run dev:backend` is a placeholder until Step 2.

Verify with: `npm run lint:frontend`, `npm run build:frontend`, `npm run typecheck:backend`, `npm run build:backend` (the last two just print "no source files yet" until Step 2 adds code).

## Completed

- [x] Next.js app scaffolded at the repo root (App Router, TypeScript, Tailwind v4, ESLint); `backend/src/` structure created (`config`, `models`, `routes`, `controllers`, `services`, `middleware`, `sockets/handlers`, `validators`, `utils`, `types`) with `tests/`
- [x] One root `package.json`, one root `tsconfig.json`, one root `.env.example` for both apps — see `DECISIONS.md`
- [x] Root `.gitignore` covering `node_modules/`, `.next/`, `backend/dist/`, `.env`, logs
- [x] `npm run lint:frontend` and `npm run build:frontend` pass clean
- [x] `PLANNING.md`, `DECISIONS.md`, `PROGRESS.md`, `README.md` in place

## Next Steps

1. **Step 2 — Backend bootstrap**: Express + TS entrypoint (`backend/src/app.ts` + `server.ts`), Mongoose connection (`config/db.ts`), Redis client (`config/redis.ts`), JWT util, `helmet`/CORS/cookie-parser + security-header middleware, `GET /api/health` (checks Mongo + Redis reachability). Replaces the `dev:backend` placeholder script.
2. Redis needs to be installed locally before Step 2 can be verified end-to-end (`sudo apt install redis-server`) — not yet done.

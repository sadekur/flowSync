# Project Progress

## Current State

Step 1 (Project Setup) complete. Repo is flat: the Next.js app lives at the repo root (no `frontend/` folder), `backend/` is the only subfolder and has no config file of its own. No backend server exists yet — `npm run dev:backend` is a placeholder until Step 2. Verify with `npm run lint:frontend`, `npm run build:frontend`, `npm run typecheck:backend`/`build:backend` (the latter two currently just print "no source files yet" — expected, `backend/src/` is empty).

## Completed

- [x] Repo scaffolded as a flat single-package repo: Next.js app (16, App Router, TS, Tailwind v4, ESLint) at the root via `create-next-app`, then relocated there; `backend/` (empty `src/` structure: `config`, `models`, `routes`, `controllers`, `services`, `middleware`, `sockets/handlers`, `validators`, `utils`, `types`, `tests`) hand-scaffolded
- [x] One root `package.json` (all deps + scripts, both apps), **one** `tsconfig.json` in the whole repo (Next's — `backend/` has none; `tsc` runs with CLI flags against a `find`-discovered file list instead), one root `.env.example` covering both apps — see `DECISIONS.md` for the full reasoning and the trade-offs accepted to get there
- [x] Root `.gitignore` covering `node_modules/`, `.next/`, `backend/dist/`, `.env`, logs
- [x] `next.config.ts` loads the root `.env` via `dotenv` (`quiet: true` — see `DECISIONS.md` re: its console-noise "tip" strings, checked and confirmed benign) — verified live
- [x] `npm run lint:frontend` clean (0 errors, confirmed still catches real violations), `npm run build:frontend` succeeds; `npm run build:backend`/`typecheck:backend` verified against real nested throwaway source (`config/`, `utils/` subfolders) before being reset to empty for Step 2
- [x] `PLANNING.md`, `DECISIONS.md`, `PROGRESS.md`, `README.md` seeded and kept current through the layout churn

## Next Steps

1. **Step 2 — Backend bootstrap**: Express + TS entrypoint (`backend/src/app.ts` + `server.ts`), Mongoose connection (`config/db.ts`), Redis client (`config/redis.ts`), JWT util, `helmet`/CORS/cookie-parser + security-header middleware, `GET /api/health` (checks Mongo + Redis reachability). Replaces the `dev:backend` placeholder script.
2. **Before Step 2 can be verified end-to-end**: Redis needs to be installed locally (`sudo apt install redis-server`, confirmed as the chosen approach) — not yet done.

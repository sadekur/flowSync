# FlowSync

Real-time team collaboration platform (auth, workspaces/projects, tasks, chat, presence, notifications) — built to learn/practice Socket.IO, Redis, and MongoDB on a Next.js + Express stack. See `PLANNING.md` for scope and phased build steps, `DECISIONS.md` for the why behind architecture/security choices, and `PROGRESS.md` for current status.

## Stack

- **Frontend** — Next.js (App Router) + React + TypeScript + Tailwind CSS + Redux Toolkit + Socket.IO client
- **Backend** — Node.js + Express + TypeScript + Socket.IO + JWT
- **Database** — MongoDB + Mongoose
- **Real-time / cache** — Redis

## Repo layout

Single-package monorepo — **one** root `package.json` (all dependencies + scripts for both apps), **one** root `.env.example`, **one** root `tsconfig.base.json` of shared compiler options. `frontend/` and `backend/` hold only the files each tool mechanically requires in its own directory (Next.js needs `next.config.ts`/`tsconfig.json` beside its `src/`; the backend's `tsconfig.json` extends the same root base) — no per-app `package.json`, no per-app `.env`.

```
flowSync/
├── package.json, package-lock.json   # single manifest for both apps
├── tsconfig.base.json                 # shared compiler options
├── .env.example                        # single env file, both apps
├── AGENTS.md                           # Next.js's own agent notes (managed by `next dev`)
├── CLAUDE.md                           # → @frontend/AGENTS.md
├── frontend/     # Next.js app (src/, public/, next.config.ts, tsconfig.json, eslint/postcss config)
├── backend/      # Express + Socket.IO API (src/, tsconfig.json extending the root base)
└── docs/         # architecture, security, per-feature API docs
```

## Prerequisites

- Node.js ≥ 20, npm ≥ 10
- MongoDB running locally (`mongod`) — already installed on this machine
- Redis running locally (`redis-server`) — install with `sudo apt install redis-server` if not yet present

## Setup

```bash
npm install                 # installs both workspaces from the repo root
cp .env.example .env         # fill in real values (JWT secrets, DB URIs)
```

## Common commands (run from repo root)

| Command | Runs |
|---|---|
| `npm run dev:frontend` | Next.js dev server (`frontend/`) |
| `npm run dev:backend` | Express + Socket.IO dev server (`backend/`) — added in Step 2 |
| `npm run build:frontend` | Production Next.js build |
| `npm run build:backend` | Compile backend TypeScript to `backend/dist` |
| `npm run lint:frontend` | ESLint on the frontend |
| `npm run typecheck:backend` | `tsc --noEmit` on the backend |

## Status

Under active step-by-step build — see `PROGRESS.md` for what's done and what's next.

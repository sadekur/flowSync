# FlowSync

Real-time team collaboration platform (auth, workspaces/projects, tasks, chat, presence, notifications) — built to learn/practice Socket.IO, Redis, and MongoDB on a Next.js + Express stack. See `PLANNING.md` for scope and phased build steps, `DECISIONS.md` for the why behind architecture/security choices, and `PROGRESS.md` for current status.

## Stack

- **Frontend** — Next.js (App Router) + React + TypeScript + Tailwind CSS + Redux Toolkit + Socket.IO client
- **Backend** — Node.js + Express + TypeScript + Socket.IO + JWT
- **Database** — MongoDB + Mongoose
- **Real-time / cache** — Redis

## Repo layout

Flat single-package repo — the Next.js app *is* the repo root (`src/`, `public/`, `next.config.ts`, `tsconfig.json`, `postcss.config.mjs`, `eslint.config.mjs` all live at top level, since Next.js requires its config co-located with the app it builds). `backend/` is the one subfolder, and it has **no `tsconfig.json` at all** — `build:backend`/`typecheck:backend` invoke `tsc` directly against every file `find backend/src -name '*.ts'` turns up, with compiler options passed as CLI flags, so there's no second TypeScript config file anywhere in the repo. One root `package.json` (all dependencies + scripts for both apps), one root `.env.example`.

```
flowSync/
├── package.json, package-lock.json      # single manifest, both apps
├── .env.example                          # single env file, both apps
├── tsconfig.json                          # the only tsconfig.json in the repo (Next's)
├── next.config.ts, postcss.config.mjs, eslint.config.mjs
├── AGENTS.md, CLAUDE.md                   # Next.js's own agent notes, managed by `next dev`
├── DECISIONS.md, PROGRESS.md, PLANNING.md, README.md
├── src/, public/                          # the Next.js app
├── backend/      # Express + Socket.IO API — src/, tests/, no config file (see above)
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
| `npm run dev:frontend` | Next.js dev server |
| `npm run dev:backend` | Express + Socket.IO dev server (`backend/`) — added in Step 2 |
| `npm run build:frontend` | Production Next.js build |
| `npm run build:backend` | Compiles every `backend/src/**/*.ts` to `backend/dist` (no tsconfig.json — flags on the `tsc` CLI) |
| `npm run lint:frontend` | ESLint on `src/` |
| `npm run typecheck:backend` | Same file-discovery + flags, with `--noEmit` |

## Status

Under active step-by-step build — see `PROGRESS.md` for what's done and what's next.

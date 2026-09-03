# Project Progress

## Current State

Step 2 (Backend bootstrap) code complete: `npm run typecheck:backend` and `npm run build:backend` pass clean, and the built server correctly fails fast with a clear error when Redis is unreachable (verified). **Not yet fully verified live** — Redis isn't installed locally yet, so `GET /api/health` returning `200` with both services connected hasn't been confirmed.

## Completed

- [x] Next.js app + `backend/` scaffold (Step 1)
- [x] Backend bootstrap: `config/env.ts` (dotenv + zod validation), `config/db.ts` (Mongoose), `config/redis.ts` (ioredis), `utils/jwt.ts`, `utils/logger.ts`, `utils/asyncHandler.ts`, `middleware/errorHandler.ts` + `notFound.ts`, `app.ts` (helmet, CORS scoped to `CORS_ORIGIN`, cookie-parser, JSON body parsing), `server.ts` (`http.createServer` + graceful shutdown)
- [x] `GET /api/health` — checks Mongo + Redis, documented in `docs/api/health.md`
- [x] `npm run typecheck:backend`, `npm run build:backend` pass; verified nested-folder compilation and the no-Redis fail-fast path live

## Next Steps

1. Install Redis (`sudo apt install redis-server`) and confirm `GET /api/health` returns `200` with both services connected — blocking final Step 2 sign-off.
2. **Step 3 — Authentication**: register/login/logout/refresh/me via JWT httpOnly cookies, using the `utils/jwt.ts` already in place.

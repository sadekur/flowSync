# Health

**Implemented.**

## `GET /api/health`

No auth required. Checks live connectivity to MongoDB and Redis.

**200** (both connected):
```json
{
  "status": "ok",
  "uptime": 12.345,
  "timestamp": "2026-09-03T11:48:00.000Z",
  "mongo": "connected",
  "redis": "connected"
}
```

**503** (either disconnected) — same shape, `"status": "degraded"`, and the relevant field reads `"disconnected"`.

It reports readiness, not an instant snapshot. Redis is checked with a `PING`, and a MongoDB connection that is still opening is waited on for up to 5 s. So the first request to a fresh serverless instance on Vercel, whose connections only progress while a request is in flight, still answers correctly.

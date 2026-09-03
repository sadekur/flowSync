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

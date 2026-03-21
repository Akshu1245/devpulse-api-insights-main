# Scalability & Production Readiness

This document describes the scalability and resilience features built into the codebase for high-traffic deployments.

## Implemented Features

### 1. Shared Rate Limiting (API Proxy)

- **Upstash Redis**: When `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set, rate limits are shared across all Edge Function instances (100 req/min per IP).
- **Fallback**: If Redis is not configured, a stricter in-memory limit (50 req/min) applies per instance.
- **Setup**: Create a Redis database at [Upstash Console](https://console.upstash.com/), then:
  ```bash
  supabase secrets set UPSTASH_REDIS_REST_URL=... UPSTASH_REDIS_REST_TOKEN=...
  ```

### 2. Circuit Breaker (API Proxy)

- Prevents hammering failing upstream APIs (Groq, OpenWeather, etc.).
- After 5 consecutive failures to an upstream host, requests fail fast with 503 for 30 seconds.
- State is per Edge Function instance; protects warm instances from cascading failures.

### 3. React Query Resilience

- **Retries**: 3 attempts with exponential backoff (1s → 2s → 4s, capped at 30s).
- **Caching**: 30s stale time, 5min cache retention.
- **Reconnect**: Auto-refetch when the tab regains focus or the network reconnects.

### 4. Database Indexes

- `idx_agent_logs_agent_created`: Optimizes rate-limiter queries (agent_id + created_at).
- `idx_agent_logs_user_created`: User-scoped log listing.
- `idx_audit_log_user_created`: Audit log pagination.

Apply with: `supabase db push` or run the migration.

### 5. RealtimeMonitor Reconnection

- Detects `CHANNEL_ERROR` and `TIMED_OUT` and auto-reconnects after 3 seconds.
- "Reconnecting..." indicator and manual "Reconnect" button when disconnected.

### 6. Supabase Client

- 30s timeout on all fetch requests to avoid hanging connections.
- Auth: PKCE, session persistence, auto-refresh.

## Deployment Checklist

- [ ] Set Upstash Redis env vars for api-proxy (recommended for production).
- [ ] Run migrations: `supabase db push`.
- [ ] Ensure Supabase project has adequate plan for expected traffic.

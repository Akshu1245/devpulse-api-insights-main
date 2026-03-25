-- High-traffic indexes for rate limiting, realtime, and dashboard queries
-- Optimizes: rate-limiter (agent_id + created_at), dashboards, audit logs

-- Composite index for rate-limiter: counts agent_logs by agent_id in last minute
CREATE INDEX IF NOT EXISTS idx_agent_logs_agent_created
  ON public.agent_logs(agent_id, created_at DESC);

-- Composite for user-scoped agent log queries (team/dashboard)
CREATE INDEX IF NOT EXISTS idx_agent_logs_user_created
  ON public.agent_logs(user_id, created_at DESC);

-- Audit log: user + time for pagination
CREATE INDEX IF NOT EXISTS idx_audit_log_user_created
  ON public.audit_log(user_id, created_at DESC);

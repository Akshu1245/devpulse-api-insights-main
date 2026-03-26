-- Thinking Token Intelligence — Enhanced Schema
-- Extends thinking_token_logs with proxy-intercepted data, per-feature attribution,
-- and structured cost breakdown for the DevPulse LLM Cost Intelligence system.
--
-- Run after: 20260321120000_devpulse_api_security.sql

BEGIN;

-- ─── Main thinking token log table ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.thinking_token_logs (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Provider / model
  provider          TEXT NOT NULL DEFAULT 'openai',  -- openai | anthropic
  model             TEXT NOT NULL,

  -- Attribution
  endpoint_name     TEXT NOT NULL DEFAULT '',
  feature_name      TEXT NOT NULL DEFAULT '',

  -- Token counts
  input_tokens      INTEGER NOT NULL DEFAULT 0,
  output_tokens     INTEGER NOT NULL DEFAULT 0,
  thinking_tokens   INTEGER NOT NULL DEFAULT 0,
  total_tokens      INTEGER NOT NULL DEFAULT 0,

  -- Detection
  detection_method  TEXT NOT NULL DEFAULT 'none',
  finish_reason     TEXT NOT NULL DEFAULT '',
  ms_per_output_token NUMERIC DEFAULT 0,

  -- Cost (USD)
  input_cost_usd    NUMERIC DEFAULT 0,
  output_cost_usd   NUMERIC DEFAULT 0,
  thinking_cost_usd NUMERIC DEFAULT 0,
  total_cost_usd    NUMERIC DEFAULT 0,

  -- Cost (INR)
  thinking_cost_inr NUMERIC DEFAULT 0,
  total_cost_inr    NUMERIC DEFAULT 0,

  -- Analysis flags
  thinking_overhead_multiplier NUMERIC DEFAULT 1.0,
  is_thinking_anomaly BOOLEAN DEFAULT FALSE,

  -- Latency
  response_latency_ms NUMERIC DEFAULT 0,

  -- Timestamps
  created_at        TIMESTAMPTZ DEFAULT now(),
  recorded_at       TIMESTAMPTZ DEFAULT now()
);

-- ─── Indexes for fast aggregation ──────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_ttoken_user_id
  ON public.thinking_token_logs (user_id);

CREATE INDEX IF NOT EXISTS idx_ttoken_user_feature
  ON public.thinking_token_logs (user_id, feature_name);

CREATE INDEX IF NOT EXISTS idx_ttoken_user_endpoint
  ON public.thinking_token_logs (user_id, endpoint_name);

CREATE INDEX IF NOT EXISTS idx_ttoken_user_provider
  ON public.thinking_token_logs (user_id, provider);

CREATE INDEX IF NOT EXISTS idx_ttoken_created_at
  ON public.thinking_token_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ttoken_anomaly
  ON public.thinking_token_logs (user_id, is_thinking_anomaly)
  WHERE is_thinking_anomaly = TRUE;

-- ─── RLS policies ─────────────────────────────────────────────────────

ALTER TABLE public.thinking_token_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own thinking token logs"
  ON public.thinking_token_logs
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own thinking token logs"
  ON public.thinking_token_logs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can manage all thinking token logs"
  ON public.thinking_token_logs
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ─── Materialized view for dashboard aggregation ──────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS public.thinking_token_daily_summary AS
SELECT
  user_id,
  DATE_TRUNC('day', created_at) AS day,
  provider,
  feature_name,
  endpoint_name,
  COUNT(*) AS call_count,
  SUM(input_tokens) AS total_input_tokens,
  SUM(output_tokens) AS total_output_tokens,
  SUM(thinking_tokens) AS total_thinking_tokens,
  SUM(total_tokens) AS total_tokens,
  SUM(thinking_cost_usd) AS total_thinking_cost_usd,
  SUM(total_cost_usd) AS total_cost_usd,
  SUM(thinking_cost_inr) AS total_thinking_cost_inr,
  SUM(total_cost_inr) AS total_cost_inr,
  AVG(thinking_overhead_multiplier) AS avg_overhead_multiplier,
  COUNT(*) FILTER (WHERE is_thinking_anomaly) AS anomaly_count,
  AVG(response_latency_ms) AS avg_latency_ms
FROM public.thinking_token_logs
GROUP BY user_id, DATE_TRUNC('day', created_at), provider, feature_name, endpoint_name;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ttoken_daily_unique
  ON public.thinking_token_daily_summary (user_id, day, provider, feature_name, endpoint_name);

-- ─── Per-feature cost attribution view ─────────────────────────────────

CREATE OR REPLACE VIEW public.thinking_token_feature_attribution AS
SELECT
  user_id,
  feature_name,
  COUNT(*) AS total_calls,
  SUM(thinking_tokens) AS total_thinking_tokens,
  SUM(total_cost_usd) AS total_cost_usd,
  SUM(thinking_cost_usd) AS total_thinking_cost_usd,
  CASE
    WHEN SUM(total_cost_usd) > 0
    THEN ROUND((SUM(thinking_cost_usd) / SUM(total_cost_usd) * 100)::numeric, 1)
    ELSE 0
  END AS thinking_cost_pct,
  AVG(thinking_overhead_multiplier) AS avg_overhead,
  COUNT(*) FILTER (WHERE is_thinking_anomaly) AS anomaly_calls,
  MAX(created_at) AS last_call_at
FROM public.thinking_token_logs
GROUP BY user_id, feature_name;

-- ─── Per-endpoint cost attribution view ────────────────────────────────

CREATE OR REPLACE VIEW public.thinking_token_endpoint_attribution AS
SELECT
  user_id,
  endpoint_name,
  model,
  COUNT(*) AS total_calls,
  SUM(input_tokens) AS total_input_tokens,
  SUM(output_tokens) AS total_output_tokens,
  SUM(thinking_tokens) AS total_thinking_tokens,
  SUM(total_cost_usd) AS total_cost_usd,
  SUM(thinking_cost_usd) AS total_thinking_cost_usd,
  CASE
    WHEN SUM(total_cost_usd) > 0
    THEN ROUND((SUM(thinking_cost_usd) / SUM(total_cost_usd) * 100)::numeric, 1)
    ELSE 0
  END AS thinking_cost_pct,
  AVG(response_latency_ms) AS avg_latency_ms,
  COUNT(*) FILTER (WHERE is_thinking_anomaly) AS anomaly_calls,
  MAX(created_at) AS last_call_at
FROM public.thinking_token_logs
GROUP BY user_id, endpoint_name, model;

COMMIT;

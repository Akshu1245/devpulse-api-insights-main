-- Migration: Add cloud-synced health events tracking
-- Purpose: Migrate incidents and uptime history from localStorage to cloud
-- Ensures authenticated users have cross-device health data persistence

-- Table: health_status_snapshots
-- Stores periodic API health snapshots for uptime calculation across devices
CREATE TABLE IF NOT EXISTS public.health_status_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  api_id TEXT NOT NULL,
  api_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('healthy', 'degraded', 'down', 'unknown')),
  latency_ms INTEGER,
  status_code INTEGER,
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Index for efficient querying
CREATE INDEX IF NOT EXISTS idx_health_snapshots_user_api 
  ON public.health_status_snapshots(user_id, api_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_health_snapshots_user_date 
  ON public.health_status_snapshots(user_id, recorded_at DESC);

-- Enable RLS for health_status_snapshots
ALTER TABLE public.health_status_snapshots ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only read their own snapshots
CREATE POLICY "Users can read own health snapshots" ON public.health_status_snapshots
  FOR SELECT
  USING (user_id = auth.uid());

-- RLS Policy: Users can only insert their own snapshots
CREATE POLICY "Users can insert own health snapshots" ON public.health_status_snapshots
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- RLS Policy: Service role can insert (for automated monitoring)
CREATE POLICY "Service role can insert snapshots" ON public.health_status_snapshots
  FOR INSERT
  USING (current_setting('role') = 'authenticated_user' OR current_user = 'postgres');

-- Trigger: Auto-update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_health_snapshots_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS health_snapshots_updated_at ON public.health_status_snapshots;
CREATE TRIGGER health_snapshots_updated_at
  BEFORE UPDATE ON public.health_status_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION update_health_snapshots_timestamp();

-- Function: Compact old snapshots (keep last 288 per API per user = 24h at 5min intervals)
CREATE OR REPLACE FUNCTION compact_health_snapshots()
RETURNS TABLE(deleted_count INTEGER) AS $$
DECLARE
  v_deleted INTEGER := 0;
BEGIN
  DELETE FROM public.health_status_snapshots
  WHERE (user_id, api_id) IN (
    SELECT user_id, api_id
    FROM public.health_status_snapshots
    GROUP BY user_id, api_id
    HAVING COUNT(*) > 288
  )
  AND id NOT IN (
    SELECT id FROM public.health_status_snapshots
    ORDER BY user_id, api_id, recorded_at DESC
    LIMIT 288 * (SELECT COUNT(DISTINCT api_id) FROM public.health_status_snapshots WHERE user_id = auth.uid())
  );

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN QUERY SELECT v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Index: For incident detection (recent down statuses)
CREATE INDEX IF NOT EXISTS idx_health_down_events
  ON public.health_status_snapshots(user_id, status, recorded_at DESC)
  WHERE status = 'down';

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON public.health_status_snapshots TO authenticated;
GRANT EXECUTE ON FUNCTION compact_health_snapshots() TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.health_status_snapshots TO service_role;

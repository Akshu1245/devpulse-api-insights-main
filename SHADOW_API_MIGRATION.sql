-- Shadow API Discovery Tables — DevPulse Patent 3
-- NHCE/DEV/2026/003
-- Run this in your Supabase SQL editor

-- Shadow API inventory records (one per scan)
CREATE TABLE IF NOT EXISTS shadow_api_inventories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_name TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  summary JSONB NOT NULL DEFAULT '{}',
  endpoint_count INTEGER NOT NULL DEFAULT 0,
  shadow_count INTEGER NOT NULL DEFAULT 0,
  shadow_risk_score INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Shadow API endpoint records (one per discovered endpoint)
CREATE TABLE IF NOT EXISTS shadow_api_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_name TEXT NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'shadow_endpoint',
  -- status values: shadow_endpoint, documented_active, dead_route,
  --                resolved_documented, resolved_deprecated,
  --                resolved_false_positive, resolved_security_risk
  risk_level TEXT NOT NULL DEFAULT 'medium',
  -- risk_level values: high, medium, low, info
  framework TEXT NOT NULL DEFAULT 'unknown',
  source_file TEXT NOT NULL DEFAULT 'unknown',
  traffic_count INTEGER NOT NULL DEFAULT 0,
  discovery_method TEXT NOT NULL DEFAULT 'traffic_correlation',
  -- discovery_method values: static_extraction, traffic_correlation, client_static
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolution TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_shadow_api_inventories_user_id
  ON shadow_api_inventories(user_id);

CREATE INDEX IF NOT EXISTS idx_shadow_api_inventories_project
  ON shadow_api_inventories(user_id, project_name);

CREATE INDEX IF NOT EXISTS idx_shadow_api_endpoints_user_id
  ON shadow_api_endpoints(user_id);

CREATE INDEX IF NOT EXISTS idx_shadow_api_endpoints_status
  ON shadow_api_endpoints(user_id, status);

CREATE INDEX IF NOT EXISTS idx_shadow_api_endpoints_project
  ON shadow_api_endpoints(user_id, project_name);

-- Row Level Security
ALTER TABLE shadow_api_inventories ENABLE ROW LEVEL SECURITY;
ALTER TABLE shadow_api_endpoints ENABLE ROW LEVEL SECURITY;

-- Users can only see their own data
CREATE POLICY "Users can view own shadow API inventories"
  ON shadow_api_inventories FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own shadow API inventories"
  ON shadow_api_inventories FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own shadow API inventories"
  ON shadow_api_inventories FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own shadow API inventories"
  ON shadow_api_inventories FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own shadow API endpoints"
  ON shadow_api_endpoints FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own shadow API endpoints"
  ON shadow_api_endpoints FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own shadow API endpoints"
  ON shadow_api_endpoints FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own shadow API endpoints"
  ON shadow_api_endpoints FOR DELETE
  USING (auth.uid() = user_id);
-- NHCE/DEV/2026/003
-- Run this in your Supabase SQL editor

-- Shadow API inventory records (one per scan)
CREATE TABLE IF NOT EXISTS shadow_api_inventories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_name TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  summary JSONB NOT NULL DEFAULT '{}',
  endpoint_count INTEGER NOT NULL DEFAULT 0,
  shadow_count INTEGER NOT NULL DEFAULT 0,
  shadow_risk_score INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Shadow API endpoint records (one per discovered endpoint)
CREATE TABLE IF NOT EXISTS shadow_api_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_name TEXT NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'shadow_endpoint',
  -- status values: shadow_endpoint, documented_active, dead_route,
  --                resolved_documented, resolved_deprecated,
  --                resolved_false_positive, resolved_security_risk
  risk_level TEXT NOT NULL DEFAULT 'medium',
  -- risk_level values: high, medium, low, info
  framework TEXT NOT NULL DEFAULT 'unknown',
  source_file TEXT NOT NULL DEFAULT 'unknown',
  traffic_count INTEGER NOT NULL DEFAULT 0,
  discovery_method TEXT NOT NULL DEFAULT 'traffic_correlation',
  -- discovery_method values: static_extraction, traffic_correlation, client_static
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolution TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_shadow_api_inventories_user_id
  ON shadow_api_inventories(user_id);

CREATE INDEX IF NOT EXISTS idx_shadow_api_inventories_project
  ON shadow_api_inventories(user_id, project_name);

CREATE INDEX IF NOT EXISTS idx_shadow_api_endpoints_user_id
  ON shadow_api_endpoints(user_id);

CREATE INDEX IF NOT EXISTS idx_shadow_api_endpoints_status
  ON shadow_api_endpoints(user_id, status);

CREATE INDEX IF NOT EXISTS idx_shadow_api_endpoints_project
  ON shadow_api_endpoints(user_id, project_name);

-- Row Level Security
ALTER TABLE shadow_api_inventories ENABLE ROW LEVEL SECURITY;
ALTER TABLE shadow_api_endpoints ENABLE ROW LEVEL SECURITY;

-- Users can only see their own data
CREATE POLICY "Users can view own shadow API inventories"
  ON shadow_api_inventories FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own shadow API inventories"
  ON shadow_api_inventories FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own shadow API inventories"
  ON shadow_api_inventories FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own shadow API inventories"
  ON shadow_api_inventories FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own shadow API endpoints"
  ON shadow_api_endpoints FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own shadow API endpoints"
  ON shadow_api_endpoints FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own shadow API endpoints"
  ON shadow_api_endpoints FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own shadow API endpoints"
  ON shadow_api_endpoints FOR DELETE
  USING (auth.uid() = user_id);


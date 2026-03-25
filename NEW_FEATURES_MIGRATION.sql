-- DevPulse New Features Migration
-- Run this in your Supabase SQL editor to add tables for new Patent features

-- ============================================================
-- Postman Collection Imports (Patent 1 - Postman Refugee Engine)
-- ============================================================
CREATE TABLE IF NOT EXISTS postman_imports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  collection_name TEXT NOT NULL,
  total_endpoints INTEGER DEFAULT 0,
  credentials_exposed_count INTEGER DEFAULT 0,
  endpoints_with_credentials INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_postman_imports_user_id ON postman_imports(user_id);

ALTER TABLE postman_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own postman imports"
  ON postman_imports FOR ALL
  USING (auth.uid() = user_id);

-- ============================================================
-- Thinking Token Logs (Patent 2 - Thinking Token Attribution)
-- ============================================================
CREATE TABLE IF NOT EXISTS thinking_token_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  endpoint_name TEXT DEFAULT '',
  feature_name TEXT DEFAULT '',
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  thinking_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  thinking_cost_inr DECIMAL(12, 6) DEFAULT 0,
  total_cost_inr DECIMAL(12, 6) DEFAULT 0,
  thinking_overhead_multiplier DECIMAL(8, 4) DEFAULT 1.0,
  is_thinking_anomaly BOOLEAN DEFAULT FALSE,
  detection_method TEXT DEFAULT 'none',
  response_latency_ms DECIMAL(10, 2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_thinking_token_logs_user_id ON thinking_token_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_thinking_token_logs_created_at ON thinking_token_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_thinking_token_logs_is_anomaly ON thinking_token_logs(is_thinking_anomaly) WHERE is_thinking_anomaly = TRUE;

ALTER TABLE thinking_token_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own thinking token logs"
  ON thinking_token_logs FOR ALL
  USING (auth.uid() = user_id);

-- ============================================================
-- Compliance Reports (Patent 4 - PCI DSS Compliance Evidence)
-- ============================================================
CREATE TABLE IF NOT EXISTS compliance_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  report_id TEXT NOT NULL UNIQUE,
  organization_name TEXT DEFAULT 'Your Organization',
  report_type TEXT DEFAULT 'both',
  pci_overall_status TEXT DEFAULT 'UNKNOWN',
  pci_compliance_percentage DECIMAL(5, 2) DEFAULT 0,
  pci_requirements_pass INTEGER DEFAULT 0,
  pci_requirements_fail INTEGER DEFAULT 0,
  pci_requirements_warn INTEGER DEFAULT 0,
  gdpr_overall_status TEXT DEFAULT 'UNKNOWN',
  total_findings INTEGER DEFAULT 0,
  report_json JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compliance_reports_user_id ON compliance_reports(user_id);

ALTER TABLE compliance_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own compliance reports"
  ON compliance_reports FOR ALL
  USING (auth.uid() = user_id);

-- ============================================================
-- Unified Risk Scores (Patent 1 - Combined Security+Cost Score)
-- ============================================================
CREATE TABLE IF NOT EXISTS unified_risk_scores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  unified_risk_score DECIMAL(5, 2) DEFAULT 0,
  risk_level TEXT DEFAULT 'minimal',
  security_score DECIMAL(5, 2) DEFAULT 100,
  security_grade TEXT DEFAULT 'A',
  cost_anomaly_ratio DECIMAL(8, 4) DEFAULT 0,
  is_cost_anomaly BOOLEAN DEFAULT FALSE,
  vulnerability_count INTEGER DEFAULT 0,
  action_required TEXT DEFAULT '',
  calculated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_unified_risk_scores_user_id ON unified_risk_scores(user_id);
CREATE INDEX IF NOT EXISTS idx_unified_risk_scores_endpoint ON unified_risk_scores(endpoint);

ALTER TABLE unified_risk_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own risk scores"
  ON unified_risk_scores FOR ALL
  USING (auth.uid() = user_id);

-- ============================================================
-- Grant permissions
-- ============================================================
GRANT ALL ON postman_imports TO authenticated;
GRANT ALL ON thinking_token_logs TO authenticated;
GRANT ALL ON compliance_reports TO authenticated;
GRANT ALL ON unified_risk_scores TO authenticated;
-- Run this in your Supabase SQL editor to add tables for new Patent features

-- ============================================================
-- Postman Collection Imports (Patent 1 - Postman Refugee Engine)
-- ============================================================
CREATE TABLE IF NOT EXISTS postman_imports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  collection_name TEXT NOT NULL,
  total_endpoints INTEGER DEFAULT 0,
  credentials_exposed_count INTEGER DEFAULT 0,
  endpoints_with_credentials INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_postman_imports_user_id ON postman_imports(user_id);

ALTER TABLE postman_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own postman imports"
  ON postman_imports FOR ALL
  USING (auth.uid() = user_id);

-- ============================================================
-- Thinking Token Logs (Patent 2 - Thinking Token Attribution)
-- ============================================================
CREATE TABLE IF NOT EXISTS thinking_token_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  endpoint_name TEXT DEFAULT '',
  feature_name TEXT DEFAULT '',
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  thinking_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  thinking_cost_inr DECIMAL(12, 6) DEFAULT 0,
  total_cost_inr DECIMAL(12, 6) DEFAULT 0,
  thinking_overhead_multiplier DECIMAL(8, 4) DEFAULT 1.0,
  is_thinking_anomaly BOOLEAN DEFAULT FALSE,
  detection_method TEXT DEFAULT 'none',
  response_latency_ms DECIMAL(10, 2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_thinking_token_logs_user_id ON thinking_token_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_thinking_token_logs_created_at ON thinking_token_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_thinking_token_logs_is_anomaly ON thinking_token_logs(is_thinking_anomaly) WHERE is_thinking_anomaly = TRUE;

ALTER TABLE thinking_token_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own thinking token logs"
  ON thinking_token_logs FOR ALL
  USING (auth.uid() = user_id);

-- ============================================================
-- Compliance Reports (Patent 4 - PCI DSS Compliance Evidence)
-- ============================================================
CREATE TABLE IF NOT EXISTS compliance_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  report_id TEXT NOT NULL UNIQUE,
  organization_name TEXT DEFAULT 'Your Organization',
  report_type TEXT DEFAULT 'both',
  pci_overall_status TEXT DEFAULT 'UNKNOWN',
  pci_compliance_percentage DECIMAL(5, 2) DEFAULT 0,
  pci_requirements_pass INTEGER DEFAULT 0,
  pci_requirements_fail INTEGER DEFAULT 0,
  pci_requirements_warn INTEGER DEFAULT 0,
  gdpr_overall_status TEXT DEFAULT 'UNKNOWN',
  total_findings INTEGER DEFAULT 0,
  report_json JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compliance_reports_user_id ON compliance_reports(user_id);

ALTER TABLE compliance_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own compliance reports"
  ON compliance_reports FOR ALL
  USING (auth.uid() = user_id);

-- ============================================================
-- Unified Risk Scores (Patent 1 - Combined Security+Cost Score)
-- ============================================================
CREATE TABLE IF NOT EXISTS unified_risk_scores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  unified_risk_score DECIMAL(5, 2) DEFAULT 0,
  risk_level TEXT DEFAULT 'minimal',
  security_score DECIMAL(5, 2) DEFAULT 100,
  security_grade TEXT DEFAULT 'A',
  cost_anomaly_ratio DECIMAL(8, 4) DEFAULT 0,
  is_cost_anomaly BOOLEAN DEFAULT FALSE,
  vulnerability_count INTEGER DEFAULT 0,
  action_required TEXT DEFAULT '',
  calculated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_unified_risk_scores_user_id ON unified_risk_scores(user_id);
CREATE INDEX IF NOT EXISTS idx_unified_risk_scores_endpoint ON unified_risk_scores(endpoint);

ALTER TABLE unified_risk_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own risk scores"
  ON unified_risk_scores FOR ALL
  USING (auth.uid() = user_id);

-- ============================================================
-- Grant permissions
-- ============================================================
GRANT ALL ON postman_imports TO authenticated;
GRANT ALL ON thinking_token_logs TO authenticated;
GRANT ALL ON compliance_reports TO authenticated;
GRANT ALL ON unified_risk_scores TO authenticated;


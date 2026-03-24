-- Supabase Migration: Create Endpoint Risk Scores Table
-- This table stores unified risk scores (combining security and cost metrics)

CREATE TABLE IF NOT EXISTS endpoint_risk_scores (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    upload_id TEXT NOT NULL,
    endpoint_id TEXT NOT NULL,
    endpoint_url TEXT NOT NULL,
    method TEXT NOT NULL DEFAULT 'GET',
    security_score NUMERIC(5, 2) NOT NULL DEFAULT 0,
    cost_anomaly_score NUMERIC(5, 2) NOT NULL DEFAULT 0,
    unified_risk_score NUMERIC(5, 2) NOT NULL DEFAULT 0,
    risk_level TEXT NOT NULL DEFAULT 'info',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_user_id FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Create indexes for common queries
CREATE INDEX idx_endpoint_risk_user_id ON endpoint_risk_scores(user_id);
CREATE INDEX idx_endpoint_risk_endpoint_id ON endpoint_risk_scores(endpoint_id);
CREATE INDEX idx_endpoint_risk_user_endpoint ON endpoint_risk_scores(user_id, endpoint_id);
CREATE INDEX idx_endpoint_risk_created_at ON endpoint_risk_scores(created_at DESC);
CREATE INDEX idx_endpoint_risk_risk_level ON endpoint_risk_scores(risk_level);

-- Enable RLS
ALTER TABLE endpoint_risk_scores ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only view their own risk scores
CREATE POLICY "Users can view own risk scores" ON endpoint_risk_scores
    FOR SELECT
    USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert own risk scores" ON endpoint_risk_scores
    FOR INSERT
    WITH CHECK (auth.uid()::text = user_id);

-- Comments
COMMENT ON TABLE endpoint_risk_scores IS 'Unified risk scores combining security severity and cost anomaly metrics';
COMMENT ON COLUMN endpoint_risk_scores.security_score IS 'Security score (0-100) based on issue severity';
COMMENT ON COLUMN endpoint_risk_scores.cost_anomaly_score IS 'Cost anomaly score (0-100) based on LLM usage baseline deviation';
COMMENT ON COLUMN endpoint_risk_scores.unified_risk_score IS 'Combined risk score = (0.6 * security_score) + (0.4 * cost_anomaly_score)';
COMMENT ON COLUMN endpoint_risk_scores.risk_level IS 'Risk category: critical (80+), high (60-79), medium (40-59), low (20-39), info (<20)';

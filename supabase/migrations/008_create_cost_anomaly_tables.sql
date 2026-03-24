-- Migration 008: Cost Anomaly Detection and Tracking Tables
-- Implements z-score statistical analysis and cost alerts

-- ============================================================
-- 1. ENDPOINT COSTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS endpoint_llm_costs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    endpoint_id UUID NOT NULL REFERENCES endpoints(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    model VARCHAR(255) NOT NULL,  -- claude-opus, claude-sonnet, etc.
    tokens_used BIGINT NOT NULL,
    tokens_cost DECIMAL(12, 8) NOT NULL,
    total_cost DECIMAL(12, 8) NOT NULL,
    request_count INT NOT NULL DEFAULT 1,
    avg_tokens_per_request INT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, endpoint_id, date, model)
);

-- Indexes for efficiency
CREATE INDEX idx_endpoint_llm_costs_user_id ON endpoint_llm_costs(user_id);
CREATE INDEX idx_endpoint_llm_costs_endpoint_id ON endpoint_llm_costs(endpoint_id);
CREATE INDEX idx_endpoint_llm_costs_date ON endpoint_llm_costs(date);
CREATE INDEX idx_endpoint_llm_costs_user_date ON endpoint_llm_costs(user_id, date);
CREATE INDEX idx_endpoint_llm_costs_endpoint_date ON endpoint_llm_costs(endpoint_id, date);

-- RLS
ALTER TABLE endpoint_llm_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY endpoint_llm_costs_user_isolation ON endpoint_llm_costs
    FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- 2. COST ANOMALIES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS cost_anomalies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    endpoint_id UUID REFERENCES endpoints(id) ON DELETE CASCADE,
    anomaly_date DATE NOT NULL,
    anomaly_type VARCHAR(50) NOT NULL,  -- high_spike, sustained_high, endpoint_surge, etc.
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    anomaly_value DECIMAL(12, 8) NOT NULL,
    baseline_value DECIMAL(12, 8) NOT NULL,
    z_score DECIMAL(10, 4) NOT NULL,
    deviation_percentage DECIMAL(8, 2) NOT NULL,
    contributing_factors JSONB NOT NULL DEFAULT '{}',  -- model, tokens, details
    affected_endpoints TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    severity VARCHAR(20) NOT NULL,  -- critical, high, medium, low, info
    is_acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    acknowledged_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_cost_anomalies_user_id ON cost_anomalies(user_id);
CREATE INDEX idx_cost_anomalies_endpoint_id ON cost_anomalies(endpoint_id);
CREATE INDEX idx_cost_anomalies_anomaly_date ON cost_anomalies(anomaly_date);
CREATE INDEX idx_cost_anomalies_user_date ON cost_anomalies(user_id, anomaly_date);
CREATE INDEX idx_cost_anomalies_severity ON cost_anomalies(severity);
CREATE INDEX idx_cost_anomalies_type ON cost_anomalies(anomaly_type);

-- RLS
ALTER TABLE cost_anomalies ENABLE ROW LEVEL SECURITY;
CREATE POLICY cost_anomalies_user_isolation ON cost_anomalies
    FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- 3. COST ALERTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS cost_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    anomaly_id UUID NOT NULL REFERENCES cost_anomalies(id) ON DELETE CASCADE,
    alert_title VARCHAR(255) NOT NULL,
    alert_description TEXT NOT NULL,
    severity VARCHAR(20) NOT NULL,  -- critical, high, medium, low, info
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    estimated_daily_impact DECIMAL(12, 8) NOT NULL,
    estimated_monthly_impact DECIMAL(12, 8) NOT NULL,
    recommendations TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    action_items TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    is_resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by UUID,
    resolution_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_cost_alerts_user_id ON cost_alerts(user_id);
CREATE INDEX idx_cost_alerts_anomaly_id ON cost_alerts(anomaly_id);
CREATE INDEX idx_cost_alerts_severity ON cost_alerts(severity);
CREATE INDEX idx_cost_alerts_is_resolved ON cost_alerts(is_resolved);
CREATE INDEX idx_cost_alerts_detected_at ON cost_alerts(detected_at);

-- RLS
ALTER TABLE cost_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY cost_alerts_user_isolation ON cost_alerts
    FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- 4. COST BASELINES TABLE (for rolling window calculations)
-- ============================================================
CREATE TABLE IF NOT EXISTS cost_baselines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    endpoint_id UUID REFERENCES endpoints(id) ON DELETE CASCADE,
    baseline_date DATE NOT NULL,
    window_days INT NOT NULL,  -- typically 30
    mean_cost DECIMAL(12, 8) NOT NULL,
    median_cost DECIMAL(12, 8) NOT NULL,
    std_dev DECIMAL(12, 8) NOT NULL,
    min_cost DECIMAL(12, 8) NOT NULL,
    max_cost DECIMAL(12, 8) NOT NULL,
    percentile_75 DECIMAL(12, 8) NOT NULL,
    percentile_90 DECIMAL(12, 8) NOT NULL,
    percentile_95 DECIMAL(12, 8) NOT NULL,
    coefficient_of_variation DECIMAL(8, 2) NOT NULL,
    sample_size INT NOT NULL,
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_cost_baselines_user_id ON cost_baselines(user_id);
CREATE INDEX idx_cost_baselines_endpoint_id ON cost_baselines(endpoint_id);
CREATE INDEX idx_cost_baselines_baseline_date ON cost_baselines(baseline_date);
CREATE INDEX idx_cost_baselines_user_endpoint_date ON cost_baselines(user_id, endpoint_id, baseline_date);

-- RLS
ALTER TABLE cost_baselines ENABLE ROW LEVEL SECURITY;
CREATE POLICY cost_baselines_user_isolation ON cost_baselines
    FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- 5. COST TRENDS TABLE (for trend analysis and projections)
-- ============================================================
CREATE TABLE IF NOT EXISTS cost_trends (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    endpoint_id UUID REFERENCES endpoints(id) ON DELETE CASCADE,
    trend_date DATE NOT NULL,
    trend_direction VARCHAR(20) NOT NULL,  -- increasing, decreasing, stable
    avg_daily_cost DECIMAL(12, 8) NOT NULL,
    projected_monthly DECIMAL(12, 8) NOT NULL,
    change_percentage DECIMAL(8, 2) NOT NULL,
    trend_confidence DECIMAL(5, 2) NOT NULL,
    days_analyzed INT NOT NULL,
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_cost_trends_user_id ON cost_trends(user_id);
CREATE INDEX idx_cost_trends_endpoint_id ON cost_trends(endpoint_id);
CREATE INDEX idx_cost_trends_trend_date ON cost_trends(trend_date);
CREATE INDEX idx_cost_trends_direction ON cost_trends(trend_direction);

-- RLS
ALTER TABLE cost_trends ENABLE ROW LEVEL SECURITY;
CREATE POLICY cost_trends_user_isolation ON cost_trends
    FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- 6. COST BUDGET POLICIES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS cost_budget_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    endpoint_id UUID REFERENCES endpoints(id) ON DELETE CASCADE,
    policy_name VARCHAR(255) NOT NULL,
    policy_description TEXT,
    daily_budget DECIMAL(12, 8),
    monthly_budget DECIMAL(12, 8),
    alert_threshold_percentage INT DEFAULT 80,  -- Alert at 80% of budget
    hard_limit BOOLEAN DEFAULT FALSE,  -- Block if exceeded
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, endpoint_id, policy_name)
);

-- Indexes
CREATE INDEX idx_cost_budget_policies_user_id ON cost_budget_policies(user_id);
CREATE INDEX idx_cost_budget_policies_endpoint_id ON cost_budget_policies(endpoint_id);
CREATE INDEX idx_cost_budget_policies_is_active ON cost_budget_policies(is_active);

-- RLS
ALTER TABLE cost_budget_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY cost_budget_policies_user_isolation ON cost_budget_policies
    FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- 7. BUDGET VIOLATIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS budget_violations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    policy_id UUID NOT NULL REFERENCES cost_budget_policies(id) ON DELETE CASCADE,
    endpoint_id UUID REFERENCES endpoints(id) ON DELETE CASCADE,
    violation_date DATE NOT NULL,
    current_cost DECIMAL(12, 8) NOT NULL,
    budget_limit DECIMAL(12, 8) NOT NULL,
    overage_amount DECIMAL(12, 8) NOT NULL,
    violation_percentage DECIMAL(8, 2) NOT NULL,
    is_acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_budget_violations_user_id ON budget_violations(user_id);
CREATE INDEX idx_budget_violations_policy_id ON budget_violations(policy_id);
CREATE INDEX idx_budget_violations_violation_date ON budget_violations(violation_date);
CREATE INDEX idx_budget_violations_endpoint_date ON budget_violations(endpoint_id, violation_date);

-- RLS
ALTER TABLE budget_violations ENABLE ROW LEVEL SECURITY;
CREATE POLICY budget_violations_user_isolation ON budget_violations
    FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- 8. MATERIALIZED VIEW: COST SUMMARY DASHBOARD
-- ============================================================
CREATE MATERIALIZED VIEW cost_summary_dashboard AS
SELECT
    a.user_id,
    COUNT(DISTINCT a.endpoint_id) as total_endpoints,
    COUNT(DISTINCT ca.id) as total_anomalies,
    COUNT(DISTINCT CASE WHEN ca.severity = 'critical' THEN ca.id END) as critical_anomalies,
    SUM(a.total_cost) as total_spend_current_month,
    AVG(a.total_cost) as avg_daily_spend,
    MAX(ca.detected_at) as last_anomaly_detected,
    COUNT(DISTINCT CASE WHEN ca.is_acknowledged = FALSE THEN ca.id END) as unacknowledged_anomalies,
    COALESCE(AVG(ct.change_percentage), 0) as avg_trend_change_pct,
    CURRENT_TIMESTAMP as refreshed_at
FROM endpoint_llm_costs a
LEFT JOIN cost_anomalies ca ON a.user_id = ca.user_id
LEFT JOIN cost_trends ct ON a.user_id = ct.user_id
WHERE a.date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY a.user_id;

-- Index for materialized view
CREATE INDEX idx_cost_summary_user_id ON cost_summary_dashboard(user_id);

-- ============================================================
-- 9. MATERIALIZED VIEW: ANOMALY SEVERITY DISTRIBUTION
-- ============================================================
CREATE MATERIALIZED VIEW anomaly_severity_distribution AS
SELECT
    user_id,
    anomaly_type,
    severity,
    COUNT(*) as count,
    AVG(deviation_percentage) as avg_deviation,
    MAX(z_score) as max_z_score,
    DATE_TRUNC('week', detected_at)::DATE as week
FROM cost_anomalies
WHERE detected_at >= CURRENT_TIMESTAMP - INTERVAL '90 days'
GROUP BY user_id, anomaly_type, severity, week;

-- Index for materialized view
CREATE INDEX idx_anomaly_severity_user_week ON anomaly_severity_distribution(user_id, week);

-- ============================================================
-- 10. MATERIALIZED VIEW: ENDPOINT COST RANKING
-- ============================================================
CREATE MATERIALIZED VIEW endpoint_cost_ranking AS
SELECT
    a.user_id,
    a.endpoint_id,
    e.name as endpoint_name,
    SUM(a.total_cost) as total_cost,
    COUNT(DISTINCT a.date) as days_with_activity,
    AVG(a.total_cost) as avg_daily_cost,
    MAX(a.total_cost) as peak_daily_cost,
    ROW_NUMBER() OVER (PARTITION BY a.user_id ORDER BY SUM(a.total_cost) DESC) as cost_rank
FROM endpoint_llm_costs a
JOIN endpoints e ON a.endpoint_id = e.id
WHERE a.date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY a.user_id, a.endpoint_id, e.name;

-- Index for materialized view
CREATE INDEX idx_endpoint_cost_user_rank ON endpoint_cost_ranking(user_id, cost_rank);

-- ============================================================
-- 11. FUNCTION: Refresh Cost Materialized Views
-- ============================================================
CREATE OR REPLACE FUNCTION refresh_cost_views()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY cost_summary_dashboard;
    REFRESH MATERIALIZED VIEW CONCURRENTLY anomaly_severity_distribution;
    REFRESH MATERIALIZED VIEW CONCURRENTLY endpoint_cost_ranking;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 12. TRIGGERS FOR AUDIT LOGGING
-- ============================================================
CREATE TRIGGER cost_anomalies_updated BEFORE UPDATE ON cost_anomalies
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER cost_alerts_updated BEFORE UPDATE ON cost_alerts
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER cost_budget_policies_updated BEFORE UPDATE ON cost_budget_policies
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- ============================================================
-- 13. GRANT PERMISSIONS
-- ============================================================
GRANT SELECT, INSERT, UPDATE ON endpoint_llm_costs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON cost_anomalies TO authenticated;
GRANT SELECT, INSERT, UPDATE ON cost_alerts TO authenticated;
GRANT SELECT, INSERT ON cost_baselines TO authenticated;
GRANT SELECT, INSERT ON cost_trends TO authenticated;
GRANT SELECT, INSERT, UPDATE ON cost_budget_policies TO authenticated;
GRANT SELECT, INSERT, UPDATE ON budget_violations TO authenticated;
GRANT SELECT ON cost_summary_dashboard TO authenticated;
GRANT SELECT ON anomaly_severity_distribution TO authenticated;
GRANT SELECT ON endpoint_cost_ranking TO authenticated;

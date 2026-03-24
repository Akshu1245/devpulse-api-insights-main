-- Migration 009: Thinking Token Attribution and Tracking Tables
-- Implements thinking token tracking, cost attribution, and compliance linking

-- ============================================================
-- 1. THINKING TOKEN RECORDS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS thinking_token_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    endpoint_id UUID NOT NULL REFERENCES endpoints(id) ON DELETE CASCADE,
    record_date DATE NOT NULL,
    model VARCHAR(255) NOT NULL,
    total_tokens_used BIGINT NOT NULL,
    estimated_thinking_tokens BIGINT NOT NULL,
    estimated_input_tokens BIGINT NOT NULL,
    estimated_output_tokens BIGINT NOT NULL,
    thinking_token_cost DECIMAL(12, 8) NOT NULL,
    input_cost DECIMAL(12, 8) NOT NULL,
    output_cost DECIMAL(12, 8) NOT NULL,
    total_cost DECIMAL(12, 8) NOT NULL,
    thinking_intensity VARCHAR(20) NOT NULL,  -- low, moderate, high, extreme
    confidence_score DECIMAL(5, 4) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, endpoint_id, record_date, model)
);

-- Indexes
CREATE INDEX idx_thinking_tokens_user_id ON thinking_token_records(user_id);
CREATE INDEX idx_thinking_tokens_endpoint_id ON thinking_token_records(endpoint_id);
CREATE INDEX idx_thinking_tokens_date ON thinking_token_records(record_date);
CREATE INDEX idx_thinking_tokens_user_date ON thinking_token_records(user_id, record_date);
CREATE INDEX idx_thinking_tokens_intensity ON thinking_token_records(thinking_intensity);
CREATE INDEX idx_thinking_tokens_model ON thinking_token_records(model);

-- RLS
ALTER TABLE thinking_token_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY thinking_tokens_user_isolation ON thinking_token_records
    FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- 2. THINKING TOKEN ATTRIBUTIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS thinking_token_attributions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    endpoint_id UUID NOT NULL REFERENCES endpoints(id) ON DELETE CASCADE,
    attribution_date DATE NOT NULL,
    period_start_date DATE NOT NULL,
    period_end_date DATE NOT NULL,
    period_days INT NOT NULL,
    total_requests INT NOT NULL,
    total_tokens BIGINT NOT NULL,
    total_thinking_tokens BIGINT NOT NULL,
    total_cost DECIMAL(12, 8) NOT NULL,
    thinking_cost_total DECIMAL(12, 8) NOT NULL,
    thinking_cost_percentage DECIMAL(8, 2) NOT NULL,
    cost_per_request DECIMAL(12, 8) NOT NULL,
    avg_thinking_intensity VARCHAR(20) NOT NULL,
    model_distribution JSONB NOT NULL,  -- Model -> percentage mapping
    compliance_linked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, endpoint_id, attribution_date)
);

-- Indexes
CREATE INDEX idx_attributions_user_id ON thinking_token_attributions(user_id);
CREATE INDEX idx_attributions_endpoint_id ON thinking_token_attributions(endpoint_id);
CREATE INDEX idx_attributions_date ON thinking_token_attributions(attribution_date);
CREATE INDEX idx_attributions_user_endpoint ON thinking_token_attributions(user_id, endpoint_id);
CREATE INDEX idx_attributions_compliance_linked ON thinking_token_attributions(compliance_linked);

-- RLS
ALTER TABLE thinking_token_attributions ENABLE ROW LEVEL SECURITY;
CREATE POLICY attributions_user_isolation ON thinking_token_attributions
    FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- 3. THINKING TOKEN COMPLIANCE LINKS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS thinking_token_compliance_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attribution_id UUID NOT NULL REFERENCES thinking_token_attributions(id) ON DELETE CASCADE,
    requirement_id UUID NOT NULL,  -- Reference to compliance requirement (from compliance_requirements)
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    linked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'active',  -- active, inactive, archived
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_compliance_links_attribution_id ON thinking_token_compliance_links(attribution_id);
CREATE INDEX idx_compliance_links_requirement_id ON thinking_token_compliance_links(requirement_id);
CREATE INDEX idx_compliance_links_user_id ON thinking_token_compliance_links(user_id);
CREATE INDEX idx_compliance_links_status ON thinking_token_compliance_links(status);

-- RLS
ALTER TABLE thinking_token_compliance_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY compliance_links_user_isolation ON thinking_token_compliance_links
    FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- 4. THINKING TOKEN MODEL PRICING TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS thinking_token_model_pricing (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_name VARCHAR(255) NOT NULL PRIMARY KEY,
    input_cost_per_million DECIMAL(12, 8) NOT NULL,
    output_cost_per_million DECIMAL(12, 8) NOT NULL,
    thinking_cost_per_million DECIMAL(12, 8) NOT NULL,
    max_thinking_tokens INT NOT NULL,
    effective_date DATE NOT NULL,
    note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert default pricing (as of March 2026)
INSERT INTO thinking_token_model_pricing (model_name, input_cost_per_million, output_cost_per_million, thinking_cost_per_million, max_thinking_tokens, effective_date, note)
VALUES
    ('claude-opus', 15.0, 75.0, 150.0, 10000, '2024-01-01', 'Claude Opus with extended thinking'),
    ('claude-3.5-sonnet', 3.0, 15.0, 15.0, 10000, '2024-06-20', 'Claude 3.5 Sonnet with thinking'),
    ('claude-3-sonnet', 3.0, 15.0, 15.0, 5000, '2024-01-01', 'Claude 3 Sonnet'),
    ('claude-3-haiku', 0.80, 4.0, 4.0, 5000, '2024-01-01', 'Claude 3 Haiku'),
    ('claude-instant-1.3', 0.80, 2.4, 0.0, 0, '2023-11-01', 'Claude Instant (no thinking support)')
ON CONFLICT DO NOTHING;

-- Index
CREATE UNIQUE INDEX idx_model_pricing_name ON thinking_token_model_pricing(model_name);

-- ============================================================
-- 5. THINKING TOKEN COST TRENDS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS thinking_token_trends (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    endpoint_id UUID REFERENCES endpoints(id) ON DELETE CASCADE,
    trend_date DATE NOT NULL,
    trend_direction VARCHAR(20) NOT NULL,  -- increasing, decreasing, stable
    avg_thinking_percentage DECIMAL(8, 2) NOT NULL,
    total_thinking_tokens BIGINT NOT NULL,
    total_thinking_cost DECIMAL(12, 8) NOT NULL,
    projected_monthly_thinking_cost DECIMAL(12, 8) NOT NULL,
    trend_confidence DECIMAL(5, 2) NOT NULL,
    model_contributing VARCHAR(255),  -- Model driving trend
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_trends_user_id ON thinking_token_trends(user_id);
CREATE INDEX idx_trends_endpoint_id ON thinking_token_trends(endpoint_id);
CREATE INDEX idx_trends_date ON thinking_token_trends(trend_date);
CREATE INDEX idx_trends_direction ON thinking_token_trends(trend_direction);

-- RLS
ALTER TABLE thinking_token_trends ENABLE ROW LEVEL SECURITY;
CREATE POLICY trends_user_isolation ON thinking_token_trends
    FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- 6. THINKING TOKEN AUDIT LOG TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS thinking_token_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL,  -- estimate, calculate, link, update, adjust
    endpoint_id UUID REFERENCES endpoints(id) ON DELETE CASCADE,
    attribution_id UUID REFERENCES thinking_token_attributions(id) ON DELETE CASCADE,
    changes JSONB NOT NULL,  -- What changed
    confidence_score DECIMAL(5, 4),
    created_by UUID,  -- System or user UUID
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    note TEXT
);

-- Indexes
CREATE INDEX idx_audit_user_id ON thinking_token_audit_log(user_id);
CREATE INDEX idx_audit_action ON thinking_token_audit_log(action);
CREATE INDEX idx_audit_created_at ON thinking_token_audit_log(created_at);

-- RLS
ALTER TABLE thinking_token_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_user_isolation ON thinking_token_audit_log
    FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- 7. MATERIALIZED VIEW: THINKING TOKEN SUMMARY
-- ============================================================
CREATE MATERIALIZED VIEW thinking_token_summary AS
SELECT
    a.user_id,
    COUNT(DISTINCT a.endpoint_id) as endpoints_using_thinking,
    SUM(a.total_thinking_tokens) as total_thinking_tokens,
    SUM(a.thinking_cost_total) as total_thinking_cost,
    AVG(a.thinking_cost_percentage) as avg_thinking_percentage,
    MAX(a.attribution_date) as last_attribution_date,
    COUNT(DISTINCT c.requirement_id) as compliance_requirements_linked,
    CURRENT_TIMESTAMP as refreshed_at
FROM thinking_token_attributions a
LEFT JOIN thinking_token_compliance_links c ON a.id = c.attribution_id
WHERE a.attribution_date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY a.user_id;

-- Index for materialized view
CREATE INDEX idx_thinking_summary_user_id ON thinking_token_summary(user_id);

-- ============================================================
-- 8. MATERIALIZED VIEW: MODEL THINKING TOKEN DISTRIBUTION
-- ============================================================
CREATE MATERIALIZED VIEW model_thinking_distribution AS
SELECT
    r.user_id,
    r.model,
    COUNT(*) as record_count,
    SUM(r.estimated_thinking_tokens) as total_thinking_tokens,
    SUM(r.thinking_token_cost) as total_thinking_cost,
    AVG(CASE WHEN r.total_tokens_used > 0 THEN (r.estimated_thinking_tokens::FLOAT / r.total_tokens_used * 100) ELSE 0 END) as avg_thinking_percentage,
    MAX(r.record_date) as last_update
FROM thinking_token_records r
WHERE r.record_date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY r.user_id, r.model;

-- Index for materialized view
CREATE INDEX idx_model_dist_user_model ON model_thinking_distribution(user_id, model);

-- ============================================================
-- 9. MATERIALIZED VIEW: COMPLIANCE-DRIVEN THINKING COSTS
-- ============================================================
CREATE MATERIALIZED VIEW compliance_driven_thinking_costs AS
SELECT
    c.user_id,
    c.requirement_id,
    COUNT(DISTINCT c.attribution_id) as attribution_count,
    SUM(a.total_thinking_tokens) as total_thinking_tokens,
    SUM(a.thinking_cost_total) as total_thinking_cost,
    AVG(a.thinking_cost_percentage) as avg_thinking_percentage,
    COUNT(DISTINCT a.endpoint_id) as affected_endpoints
FROM thinking_token_compliance_links c
JOIN thinking_token_attributions a ON c.attribution_id = a.id
WHERE c.status = 'active' AND a.attribution_date >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY c.user_id, c.requirement_id;

-- Index for materialized view
CREATE INDEX idx_compliance_thinking_user_req ON compliance_driven_thinking_costs(user_id, requirement_id);

-- ============================================================
-- 10. FUNCTION: Refresh Thinking Token Views
-- ============================================================
CREATE OR REPLACE FUNCTION refresh_thinking_token_views()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY thinking_token_summary;
    REFRESH MATERIALIZED VIEW CONCURRENTLY model_thinking_distribution;
    REFRESH MATERIALIZED VIEW CONCURRENTLY compliance_driven_thinking_costs;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 11. TRIGGERS FOR UPDATE TIMESTAMPS
-- ============================================================
CREATE TRIGGER thinking_token_records_updated BEFORE UPDATE ON thinking_token_records
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER attributions_updated BEFORE UPDATE ON thinking_token_attributions
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trends_updated BEFORE UPDATE ON thinking_token_trends
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- ============================================================
-- 12. GRANT PERMISSIONS
-- ============================================================
GRANT SELECT, INSERT, UPDATE ON thinking_token_records TO authenticated;
GRANT SELECT, INSERT, UPDATE ON thinking_token_attributions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON thinking_token_compliance_links TO authenticated;
GRANT SELECT ON thinking_token_model_pricing TO authenticated;
GRANT SELECT, INSERT, UPDATE ON thinking_token_trends TO authenticated;
GRANT SELECT, INSERT ON thinking_token_audit_log TO authenticated;
GRANT SELECT ON thinking_token_summary TO authenticated;
GRANT SELECT ON model_thinking_distribution TO authenticated;
GRANT SELECT ON compliance_driven_thinking_costs TO authenticated;

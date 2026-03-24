-- Migration 010: Shadow API Discovery Tables
-- Creates tables for tracking, analyzing, and managing shadow APIs

-- shadow_api_discoveries: Main table for detected shadow APIs
CREATE TABLE shadow_api_discoveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    endpoint_path TEXT NOT NULL,
    http_method VARCHAR(10) NOT NULL,
    first_seen TIMESTAMP WITH TIME ZONE NOT NULL,
    last_seen TIMESTAMP WITH TIME ZONE NOT NULL,
    request_count INTEGER NOT NULL DEFAULT 0,
    unique_users INTEGER NOT NULL DEFAULT 0,
    avg_response_time_ms NUMERIC(10, 2) DEFAULT 0,
    max_response_time_ms INTEGER DEFAULT 0,
    risk_level VARCHAR(20) NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
    risk_score NUMERIC(5, 2) NOT NULL CHECK (risk_score >= 0 AND risk_score <= 100),
    confidence NUMERIC(5, 2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    anomaly_types TEXT[] DEFAULT ARRAY[]::TEXT[],
    behavioral_patterns JSONB DEFAULT '{}'::JSONB,
    affected_compliance_ids TEXT[] DEFAULT ARRAY[]::TEXT[],
    remediation_items TEXT[] DEFAULT ARRAY[]::TEXT[],
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'dismissed', 'whitelisted', 'remediated')),
    dismissal_reason TEXT,
    remediation_date TIMESTAMP WITH TIME ZONE,
    discovered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- Indexes for shadow_api_discoveries
CREATE INDEX idx_shadow_api_discoveries_user_id ON shadow_api_discoveries(user_id);
CREATE INDEX idx_shadow_api_discoveries_risk_level ON shadow_api_discoveries(risk_level);
CREATE INDEX idx_shadow_api_discoveries_status ON shadow_api_discoveries(status);
CREATE INDEX idx_shadow_api_discoveries_risk_score ON shadow_api_discoveries(risk_score DESC);
CREATE INDEX idx_shadow_api_discoveries_user_risk ON shadow_api_discoveries(user_id, risk_level);
CREATE INDEX idx_shadow_api_discoveries_endpoint ON shadow_api_discoveries(user_id, endpoint_path, http_method);
CREATE INDEX idx_shadow_api_discoveries_discovered_at ON shadow_api_discoveries(discovered_at DESC);

-- shadow_api_patterns: Learned patterns for pattern matching
CREATE TABLE shadow_api_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    pattern_regex TEXT NOT NULL,
    pattern_type VARCHAR(50) NOT NULL,
    description TEXT,
    risk_multiplier NUMERIC(5, 2) DEFAULT 1.0,
    is_custom BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_shadow_api_patterns_user_id ON shadow_api_patterns(user_id);
CREATE INDEX idx_shadow_api_patterns_type ON shadow_api_patterns(pattern_type);
CREATE INDEX idx_shadow_api_patterns_custom ON shadow_api_patterns(is_custom);

-- shadow_api_behavioral_profiles: Baseline behavioral patterns for comparison
CREATE TABLE shadow_api_behavioral_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    endpoint_id UUID REFERENCES endpoints(id),
    endpoint_path TEXT NOT NULL,
    http_method VARCHAR(10) NOT NULL,
    avg_request_rate_per_hour NUMERIC(10, 2),
    avg_response_time_ms NUMERIC(10, 2),
    avg_payload_size INTEGER,
    typical_status_codes INTEGER[] DEFAULT ARRAY[200],
    typical_parameters TEXT[],
    learned_from_requests INTEGER DEFAULT 0,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_shadow_api_behavioral_profiles_user_id ON shadow_api_behavioral_profiles(user_id);
CREATE INDEX idx_shadow_api_behavioral_profiles_endpoint ON shadow_api_behavioral_profiles(user_id, endpoint_path, http_method);

-- shadow_api_compliance_links: Links shadow APIs to compliance requirements
CREATE TABLE shadow_api_compliance_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    discovery_id UUID NOT NULL REFERENCES shadow_api_discoveries(id) ON DELETE CASCADE,
    requirement_id UUID NOT NULL REFERENCES compliance_requirements(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    violation_type VARCHAR(100),
    severity_level VARCHAR(20) CHECK (severity_level IN ('low', 'medium', 'high', 'critical')),
    linked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_shadow_api_compliance_links_discovery_id ON shadow_api_compliance_links(discovery_id);
CREATE INDEX idx_shadow_api_compliance_links_requirement_id ON shadow_api_compliance_links(requirement_id);
CREATE INDEX idx_shadow_api_compliance_links_user_id ON shadow_api_compliance_links(user_id);

-- shadow_api_anomalies: Detailed anomaly records
CREATE TABLE shadow_api_anomalies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    discovery_id UUID NOT NULL REFERENCES shadow_api_discoveries(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    anomaly_type VARCHAR(50) NOT NULL,
    description TEXT,
    severity_score NUMERIC(5, 2) CHECK (severity_score >= 0 AND severity_score <= 100),
    first_detected TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_detected TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    occurrence_count INTEGER DEFAULT 1,
    affected_endpoints TEXT[] DEFAULT ARRAY[]::TEXT[]
);

CREATE INDEX idx_shadow_api_anomalies_discovery_id ON shadow_api_anomalies(discovery_id);
CREATE INDEX idx_shadow_api_anomalies_user_id ON shadow_api_anomalies(user_id);
CREATE INDEX idx_shadow_api_anomalies_type ON shadow_api_anomalies(anomaly_type);

-- shadow_api_audit_log: Audit trail for all shadow API actions
CREATE TABLE shadow_api_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    discovery_id UUID REFERENCES shadow_api_discoveries(id),
    action VARCHAR(50) NOT NULL,
    changes JSONB DEFAULT '{}'::JSONB,
    reason TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_shadow_api_audit_log_user_id ON shadow_api_audit_log(user_id);
CREATE INDEX idx_shadow_api_audit_log_discovery_id ON shadow_api_audit_log(discovery_id);
CREATE INDEX idx_shadow_api_audit_log_action ON shadow_api_audit_log(action);
CREATE INDEX idx_shadow_api_audit_log_created_at ON shadow_api_audit_log(created_at DESC);

-- shadow_api_risk_trends: Track risk trends over time
CREATE TABLE shadow_api_risk_trends (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    trend_date DATE NOT NULL,
    critical_count INTEGER DEFAULT 0,
    high_count INTEGER DEFAULT 0,
    medium_count INTEGER DEFAULT 0,
    low_count INTEGER DEFAULT 0,
    total_shadow_apis INTEGER DEFAULT 0,
    avg_risk_score NUMERIC(5, 2),
    compliance_violations INTEGER DEFAULT 0,
    remediated_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_shadow_api_risk_trends_user_date ON shadow_api_risk_trends(user_id, trend_date);
CREATE INDEX idx_shadow_api_risk_trends_user_id ON shadow_api_risk_trends(user_id);

-- RLS Policy: shadow_api_discoveries
ALTER TABLE shadow_api_discoveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY shadow_api_discoveries_user_isolation ON shadow_api_discoveries
    USING (user_id = current_user_id())
    WITH CHECK (user_id = current_user_id());

-- RLS Policy: shadow_api_patterns
ALTER TABLE shadow_api_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY shadow_api_patterns_user_isolation ON shadow_api_patterns
    USING (user_id = current_user_id())
    WITH CHECK (user_id = current_user_id());

-- RLS Policy: shadow_api_behavioral_profiles
ALTER TABLE shadow_api_behavioral_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY shadow_api_behavioral_profiles_user_isolation ON shadow_api_behavioral_profiles
    USING (user_id = current_user_id())
    WITH CHECK (user_id = current_user_id());

-- RLS Policy: shadow_api_compliance_links
ALTER TABLE shadow_api_compliance_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY shadow_api_compliance_links_user_isolation ON shadow_api_compliance_links
    USING (user_id = current_user_id())
    WITH CHECK (user_id = current_user_id());

-- RLS Policy: shadow_api_anomalies
ALTER TABLE shadow_api_anomalies ENABLE ROW LEVEL SECURITY;

CREATE POLICY shadow_api_anomalies_user_isolation ON shadow_api_anomalies
    USING (user_id = current_user_id())
    WITH CHECK (user_id = current_user_id());

-- RLS Policy: shadow_api_audit_log
ALTER TABLE shadow_api_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY shadow_api_audit_log_user_isolation ON shadow_api_audit_log
    USING (user_id = current_user_id())
    WITH CHECK (user_id = current_user_id());

-- RLS Policy: shadow_api_risk_trends
ALTER TABLE shadow_api_risk_trends ENABLE ROW LEVEL SECURITY;

CREATE POLICY shadow_api_risk_trends_user_isolation ON shadow_api_risk_trends
    USING (user_id = current_user_id())
    WITH CHECK (user_id = current_user_id());

-- Trigger: Update updated_at timestamp for shadow_api_discoveries
CREATE TRIGGER update_shadow_api_discoveries_updated_at
BEFORE UPDATE ON shadow_api_discoveries
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

-- Trigger: Update updated_at timestamp for shadow_api_patterns
CREATE TRIGGER update_shadow_api_patterns_updated_at
BEFORE UPDATE ON shadow_api_patterns
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

-- Trigger: Update updated_at timestamp for shadow_api_behavioral_profiles
CREATE TRIGGER update_shadow_api_behavioral_profiles_updated_at
BEFORE UPDATE ON shadow_api_behavioral_profiles
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

-- Trigger: Update updated_at timestamp for shadow_api_compliance_links
CREATE TRIGGER update_shadow_api_compliance_links_updated_at
BEFORE UPDATE ON shadow_api_compliance_links
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

-- Trigger: Create audit log entry on discovery
CREATE TRIGGER audit_shadow_api_discoveries_insert
AFTER INSERT ON shadow_api_discoveries
FOR EACH ROW
EXECUTE FUNCTION create_audit_log();

-- Trigger: Create audit log entry on discovery update
CREATE TRIGGER audit_shadow_api_discoveries_update
AFTER UPDATE ON shadow_api_discoveries
FOR EACH ROW
WHEN (NEW.status IS DISTINCT FROM OLD.status OR NEW.risk_score IS DISTINCT FROM OLD.risk_score)
EXECUTE FUNCTION create_audit_log();

-- Materialized View: shadow_api_summary
CREATE MATERIALIZED VIEW shadow_api_summary AS
SELECT
    user_id,
    COUNT(*) as total_shadow_apis,
    COUNT(CASE WHEN risk_level = 'critical' THEN 1 END) as critical_count,
    COUNT(CASE WHEN risk_level = 'high' THEN 1 END) as high_count,
    COUNT(CASE WHEN risk_level = 'medium' THEN 1 END) as medium_count,
    COUNT(CASE WHEN risk_level = 'low' THEN 1 END) as low_count,
    AVG(risk_score) as avg_risk_score,
    COUNT(DISTINCT CASE WHEN status = 'active' THEN id END) as active_count,
    COUNT(DISTINCT CASE WHEN status = 'whitelisted' THEN id END) as whitelisted_count,
    COUNT(DISTINCT CASE WHEN status = 'remediated' THEN id END) as remediated_count
FROM shadow_api_discoveries
WHERE status != 'dismissed'
GROUP BY user_id;

CREATE UNIQUE INDEX idx_shadow_api_summary_user_id ON shadow_api_summary(user_id);

-- Materialized View: shadow_apis_by_compliance
CREATE MATERIALIZED VIEW shadow_apis_by_compliance AS
SELECT
    sac.requirement_id,
    sac.user_id,
    COUNT(*) as affected_shadow_apis,
    AVG(sd.risk_score) as avg_risk_score,
    COUNT(CASE WHEN sd.risk_level = 'critical' THEN 1 END) as critical_count
FROM shadow_api_compliance_links sac
JOIN shadow_api_discoveries sd ON sac.discovery_id = sd.id
GROUP BY sac.requirement_id, sac.user_id;

CREATE UNIQUE INDEX idx_shadow_apis_by_compliance_req_user ON shadow_apis_by_compliance(requirement_id, user_id);

-- Materialized View: shadow_api_risks_by_type
CREATE MATERIALIZED VIEW shadow_api_risks_by_type AS
SELECT
    user_id,
    unnest(anomaly_types) as anomaly_type,
    COUNT(*) as occurrence_count,
    AVG(risk_score) as avg_risk_score,
    COUNT(CASE WHEN risk_level = 'critical' THEN 1 END) as critical_count
FROM shadow_api_discoveries
WHERE status != 'dismissed'
GROUP BY user_id, anomaly_type;

CREATE UNIQUE INDEX idx_shadow_api_risks_by_type_user_anomaly ON shadow_api_risks_by_type(user_id, anomaly_type);

-- Function: Refresh shadow API materialized views
CREATE OR REPLACE FUNCTION refresh_shadow_api_views() 
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY shadow_api_summary;
    REFRESH MATERIALIZED VIEW CONCURRENTLY shadow_apis_by_compliance;
    REFRESH MATERIALIZED VIEW CONCURRENTLY shadow_api_risks_by_type;
END;
$$ LANGUAGE plpgsql;

-- Function: Create audit log entry for shadow API actions
CREATE OR REPLACE FUNCTION create_audit_log()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO shadow_api_audit_log (user_id, discovery_id, action, changes)
    VALUES (
        NEW.user_id,
        NEW.id,
        TG_ARGV[0]::VARCHAR,
        to_jsonb(NEW) - to_jsonb(OLD)
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Seed initial anomaly pattern library
INSERT INTO shadow_api_patterns (user_id, pattern_regex, pattern_type, description, is_custom)
SELECT 
    auth.users.id,
    pattern_regex,
    pattern_type,
    description,
    FALSE
FROM auth.users,
(
    VALUES
    ('(admin|_admin|/admin).*', 'administrative', 'Admin panel or administrative endpoints'),
    ('(debug|_debug|/debug).*', 'debug', 'Debug or testing endpoints'),
    ('(internal|_internal).*', 'internal', 'Internal-only endpoints'),
    ('(backup|_backup).*', 'backup', 'Data backup endpoints'),
    ('.*(password|token|secret|apikey).*', 'credential_exposure', 'Endpoints exposing credentials'),
    ('(import|export|dump).*', 'data_operation', 'Bulk data operation endpoints'),
    ('/api/v[0-9]+/.*', 'versioned_api', 'Undocumented API versions'),
    ('(test|mock|stub).*', 'testing', 'Testing or mock data endpoints')
) AS patterns(pattern_regex, pattern_type, description, is_custom);

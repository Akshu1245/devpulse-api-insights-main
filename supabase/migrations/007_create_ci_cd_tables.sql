-- Migration: 007_create_ci_cd_tables.sql
-- Purpose: Create CI/CD integration tables for GitHub
-- Date: 2024-01-15

-- Create github_integrations table
CREATE TABLE IF NOT EXISTS github_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    repository TEXT NOT NULL, -- "owner/repo"
    owner TEXT NOT NULL,
    repo_name TEXT NOT NULL,
    github_token_hash TEXT NOT NULL, -- SHA256 hash of token
    is_active BOOLEAN DEFAULT TRUE,
    last_webhook_received TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, repository)
);

-- Create ci_cd_checks table (store check run results)
CREATE TABLE IF NOT EXISTS ci_cd_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    repository TEXT NOT NULL,
    pr_number INTEGER,
    branch TEXT,
    head_sha TEXT,
    status TEXT NOT NULL, -- 'pending', 'in_progress', 'completed', 'failed'
    compliance_score DECIMAL(5,2),
    critical_issues INTEGER,
    total_issues INTEGER,
    endpoints_checked TEXT, -- Comma-separated endpoint IDs
    check_result JSONB, -- Full check details
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Create ci_cd_policies table
CREATE TABLE IF NOT EXISTS ci_cd_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    min_compliance_score DECIMAL(5,2) NOT NULL DEFAULT 80.0,
    max_critical_issues INTEGER NOT NULL DEFAULT 0,
    max_high_issues INTEGER NOT NULL DEFAULT 5,
    require_security_review BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create ci_cd_policy_violations table
CREATE TABLE IF NOT EXISTS ci_cd_policy_violations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    check_id UUID NOT NULL REFERENCES ci_cd_checks(id) ON DELETE CASCADE,
    policy_id UUID NOT NULL REFERENCES ci_cd_policies(id) ON DELETE CASCADE,
    violation_type TEXT NOT NULL, -- 'compliance_score', 'critical_issues', 'security_review'
    violation_message TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create pr_comments table (to track posted comments)
CREATE TABLE IF NOT EXISTS pr_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    check_id UUID NOT NULL REFERENCES ci_cd_checks(id) ON DELETE CASCADE,
    repository TEXT NOT NULL,
    pr_number INTEGER NOT NULL,
    comment_id INTEGER, -- GitHub comment ID
    comment_body TEXT NOT NULL,
    is_compliance_comment BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create check_run_records table (GitHub check run tracking)
CREATE TABLE IF NOT EXISTS check_run_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    repository TEXT NOT NULL,
    check_run_id BIGINT NOT NULL, -- GitHub check run ID
    head_sha TEXT NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL, -- 'queued', 'in_progress', 'completed'
    conclusion TEXT, -- 'success', 'failure', 'neutral', etc.
    check_details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, repository, check_run_id)
);

-- Create deployment_records table (track deployments to prod)
CREATE TABLE IF NOT EXISTS deployment_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    repository TEXT NOT NULL,
    deployment_sha TEXT NOT NULL,
    deployment_ref TEXT NOT NULL,
    environment TEXT NOT NULL, -- 'production', 'staging', 'development'
    required_compliance_score DECIMAL(5,2),
    actual_compliance_score DECIMAL(5,2),
    compliant BOOLEAN,
    deployment_status TEXT NOT NULL, -- 'approved', 'blocked', 'deployed'
    reason_blocked TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deployed_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for performance
CREATE INDEX idx_github_integrations_user_id ON github_integrations(user_id);
CREATE INDEX idx_github_integrations_repository ON github_integrations(repository);
CREATE INDEX idx_github_integrations_active ON github_integrations(is_active);

CREATE INDEX idx_ci_cd_checks_user_id ON ci_cd_checks(user_id);
CREATE INDEX idx_ci_cd_checks_repository ON ci_cd_checks(repository);
CREATE INDEX idx_ci_cd_checks_pr_number ON ci_cd_checks(pr_number);
CREATE INDEX idx_ci_cd_checks_status ON ci_cd_checks(status);
CREATE INDEX idx_ci_cd_checks_created_at ON ci_cd_checks(created_at DESC);
CREATE INDEX idx_ci_cd_checks_compliance_score ON ci_cd_checks(compliance_score);

CREATE INDEX idx_ci_cd_policies_user_id ON ci_cd_policies(user_id);
CREATE INDEX idx_ci_cd_policies_active ON ci_cd_policies(is_active);

CREATE INDEX idx_ci_cd_violations_user_id ON ci_cd_policy_violations(user_id);
CREATE INDEX idx_ci_cd_violations_check_id ON ci_cd_policy_violations(check_id);
CREATE INDEX idx_ci_cd_violations_policy_id ON ci_cd_policy_violations(policy_id);

CREATE INDEX idx_pr_comments_user_id ON pr_comments(user_id);
CREATE INDEX idx_pr_comments_check_id ON pr_comments(check_id);
CREATE INDEX idx_pr_comments_repository_pr ON pr_comments(repository, pr_number);

CREATE INDEX idx_check_run_records_user_id ON check_run_records(user_id);
CREATE INDEX idx_check_run_records_repository ON check_run_records(repository);
CREATE INDEX idx_check_run_records_sha ON check_run_records(head_sha);

CREATE INDEX idx_deployment_records_user_id ON deployment_records(user_id);
CREATE INDEX idx_deployment_records_repository ON deployment_records(repository);
CREATE INDEX idx_deployment_records_environment ON deployment_records(environment);
CREATE INDEX idx_deployment_records_status ON deployment_records(deployment_status);

-- Create RLS policies
ALTER TABLE github_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ci_cd_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE ci_cd_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE ci_cd_policy_violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE pr_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE check_run_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE deployment_records ENABLE ROW LEVEL SECURITY;

-- RLS: Users can only see their own GitHub integrations
CREATE POLICY github_integrations_user_policy ON github_integrations
    FOR ALL USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- RLS: Users can only see their own checks
CREATE POLICY ci_cd_checks_user_policy ON ci_cd_checks
    FOR ALL USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- RLS: Users can only see their own policies
CREATE POLICY ci_cd_policies_user_policy ON ci_cd_policies
    FOR ALL USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- RLS: Users can only see their own violations
CREATE POLICY ci_cd_violations_user_policy ON ci_cd_policy_violations
    FOR ALL USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- RLS: Users can only see their own comments
CREATE POLICY pr_comments_user_policy ON pr_comments
    FOR ALL USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- RLS: Users can only see their own check run records
CREATE POLICY check_run_records_user_policy ON check_run_records
    FOR ALL USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- RLS: Users can only see their own deployment records
CREATE POLICY deployment_records_user_policy ON deployment_records
    FOR ALL USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Create triggers for updated_at
CREATE OR REPLACE FUNCTION update_github_integrations_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER github_integrations_update_timestamp
BEFORE UPDATE ON github_integrations
FOR EACH ROW
EXECUTE FUNCTION update_github_integrations_timestamp();

CREATE OR REPLACE FUNCTION update_ci_cd_checks_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ci_cd_checks_update_timestamp
BEFORE UPDATE ON ci_cd_checks
FOR EACH ROW
EXECUTE FUNCTION update_ci_cd_checks_timestamp();

-- Grant permissions
GRANT SELECT ON github_integrations TO authenticated;
GRANT SELECT ON ci_cd_checks TO authenticated;
GRANT SELECT ON ci_cd_policies TO authenticated;
GRANT SELECT ON ci_cd_policy_violations TO authenticated;
GRANT SELECT ON pr_comments TO authenticated;
GRANT SELECT ON check_run_records TO authenticated;
GRANT SELECT ON deployment_records TO authenticated;

-- Create view for compliance enforcement
CREATE VIEW ci_cd_enforcement_summary AS
SELECT 
    u.id as user_id,
    COUNT(DISTINCT gi.id) as github_integrations_count,
    COUNT(DISTINCT CASE WHEN cc.status = 'completed' THEN cc.id END) as completed_checks,
    COUNT(DISTINCT CASE WHEN cc.compliance_score < 80 THEN cc.id END) as non_compliant_checks,
    COUNT(DISTINCT CASE WHEN cpv.id IS NOT NULL THEN cpv.id END) as total_violations,
    COUNT(DISTINCT CASE WHEN cp.is_active THEN cp.id END) as active_policies,
    AVG(cc.compliance_score) as avg_compliance_score
FROM auth.users u
LEFT JOIN github_integrations gi ON u.id = gi.user_id
LEFT JOIN ci_cd_checks cc ON u.id = cc.user_id
LEFT JOIN ci_cd_policy_violations cpv ON u.id = cpv.user_id
LEFT JOIN ci_cd_policies cp ON u.id = cp.user_id
GROUP BY u.id;

CREATE INDEX idx_ci_cd_enforcement_user_id ON ci_cd_enforcement_summary(user_id);

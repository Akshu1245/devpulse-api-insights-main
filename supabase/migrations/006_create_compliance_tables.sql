-- Migration: 006_create_compliance_tables.sql
-- Purpose: Create compliance assessment, issue mapping, and report storage tables
-- Frameworks: PCI DSS v4.0, GDPR
-- Date: 2024-01-15

-- Create compliance_assessments table
CREATE TABLE IF NOT EXISTS compliance_assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    endpoint_id TEXT NOT NULL,
    assessment_type TEXT NOT NULL, -- 'pci_dss_v4', 'gdpr', 'combined'
    overall_compliance_percentage DECIMAL(5,2) NOT NULL,
    total_issues INTEGER NOT NULL,
    critical_issues INTEGER NOT NULL DEFAULT 0,
    requirements_affected INTEGER NOT NULL,
    compliance_status TEXT NOT NULL, -- 'compliant', 'partially_compliant', 'non_compliant'
    assessment_data JSONB NOT NULL, -- Full assessment JSON
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, endpoint_id, assessment_type, created_at)
);

-- Create compliance_issues table (mapping issues to requirements)
CREATE TABLE IF NOT EXISTS compliance_issues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    assessment_id UUID NOT NULL REFERENCES compliance_assessments(id) ON DELETE CASCADE,
    issue_type TEXT NOT NULL, -- 'OWASP-A01', 'CWE-79', etc.
    issue_name TEXT NOT NULL,
    risk_level TEXT NOT NULL, -- 'critical', 'high', 'medium', 'low', 'info'
    framework TEXT NOT NULL, -- 'pci_dss_v4', 'gdpr'
    requirement_id TEXT NOT NULL, -- '7', 'Article 32', etc.
    requirement_name TEXT NOT NULL,
    compliance_level TEXT NOT NULL, -- 'must-fix', 'should-fix', 'may-fix', 'recommended'
    remediation_steps TEXT[] NOT NULL,
    audit_guidance TEXT NOT NULL,
    affected_data_types TEXT[] NOT NULL, -- ['payment_cards', 'pii', 'health']
    status TEXT NOT NULL DEFAULT 'open', -- 'open', 'in_progress', 'resolved', 'accepted_risk'
    remediation_target_date DATE,
    resolution_date DATE,
    resolution_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create compliance_reports table (store generated reports)
CREATE TABLE IF NOT EXISTS compliance_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    assessment_id UUID NOT NULL REFERENCES compliance_assessments(id) ON DELETE CASCADE,
    report_type TEXT NOT NULL, -- 'json', 'html', 'pdf'
    report_format TEXT NOT NULL, -- 'executive_summary', 'detailed', 'full'
    report_content BYTEA NOT NULL, -- Binary or text report data
    organization_name TEXT NOT NULL,
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    report_hash TEXT NOT NULL, -- Hash for deduplication
    expires_at TIMESTAMP WITH TIME ZONE, -- For temporary reports
    is_draft BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create compliance_evidence table (audit trail)
CREATE TABLE IF NOT EXISTS compliance_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    issue_id UUID NOT NULL REFERENCES compliance_issues(id) ON DELETE CASCADE,
    evidence_type TEXT NOT NULL, -- 'scan_result', 'remediation_proof', 'approval'
    evidence_content JSONB NOT NULL,
    evidence_summary TEXT NOT NULL,
    uploaded_by TEXT NOT NULL,
    verified BOOLEAN DEFAULT FALSE,
    verified_by TEXT,
    verified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create compliance_remediation_plan table (tracking progress)
CREATE TABLE IF NOT EXISTS compliance_remediation_plan (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    assessment_id UUID NOT NULL REFERENCES compliance_assessments(id) ON DELETE CASCADE,
    issue_id UUID NOT NULL REFERENCES compliance_issues(id) ON DELETE CASCADE,
    remediation_step_num INTEGER NOT NULL,
    remediation_action TEXT NOT NULL,
    responsible_team TEXT NOT NULL,
    target_date DATE NOT NULL,
    completion_date DATE,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'blocked'
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX idx_compliance_assessments_user_id ON compliance_assessments(user_id);
CREATE INDEX idx_compliance_assessments_endpoint_id ON compliance_assessments(endpoint_id);
CREATE INDEX idx_compliance_assessments_status ON compliance_assessments(compliance_status);
CREATE INDEX idx_compliance_assessments_created_at ON compliance_assessments(created_at DESC);
CREATE INDEX idx_compliance_assessments_type ON compliance_assessments(assessment_type);

CREATE INDEX idx_compliance_issues_user_id ON compliance_issues(user_id);
CREATE INDEX idx_compliance_issues_assessment_id ON compliance_issues(assessment_id);
CREATE INDEX idx_compliance_issues_framework ON compliance_issues(framework);
CREATE INDEX idx_compliance_issues_risk_level ON compliance_issues(risk_level);
CREATE INDEX idx_compliance_issues_status ON compliance_issues(status);
CREATE INDEX idx_compliance_issues_requirement_id ON compliance_issues(requirement_id);

CREATE INDEX idx_compliance_reports_user_id ON compliance_reports(user_id);
CREATE INDEX idx_compliance_reports_assessment_id ON compliance_reports(assessment_id);
CREATE INDEX idx_compliance_reports_type ON compliance_reports(report_type);
CREATE INDEX idx_compliance_reports_created_at ON compliance_reports(created_at DESC);

CREATE INDEX idx_compliance_evidence_user_id ON compliance_evidence(user_id);
CREATE INDEX idx_compliance_evidence_issue_id ON compliance_evidence(issue_id);
CREATE INDEX idx_compliance_evidence_type ON compliance_evidence(evidence_type);

CREATE INDEX idx_compliance_remediation_user_id ON compliance_remediation_plan(user_id);
CREATE INDEX idx_compliance_remediation_assessment_id ON compliance_remediation_plan(assessment_id);
CREATE INDEX idx_compliance_remediation_status ON compliance_remediation_plan(status);
CREATE INDEX idx_compliance_remediation_target_date ON compliance_remediation_plan(target_date);

-- Create RLS policies
ALTER TABLE compliance_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_remediation_plan ENABLE ROW LEVEL SECURITY;

-- RLS: Users can only see their own assessments
CREATE POLICY compliance_assessments_user_policy ON compliance_assessments
    FOR ALL USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- RLS: Users can only see their own issues
CREATE POLICY compliance_issues_user_policy ON compliance_issues
    FOR ALL USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- RLS: Users can only see their own reports
CREATE POLICY compliance_reports_user_policy ON compliance_reports
    FOR ALL USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- RLS: Users can only see their own evidence
CREATE POLICY compliance_evidence_user_policy ON compliance_evidence
    FOR ALL USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- RLS: Users can only see their own remediation plans
CREATE POLICY compliance_remediation_user_policy ON compliance_remediation_plan
    FOR ALL USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_compliance_assessments_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER compliance_assessments_update_timestamp
BEFORE UPDATE ON compliance_assessments
FOR EACH ROW
EXECUTE FUNCTION update_compliance_assessments_timestamp();

-- Similar triggers for other tables
CREATE OR REPLACE FUNCTION update_compliance_issues_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER compliance_issues_update_timestamp
BEFORE UPDATE ON compliance_issues
FOR EACH ROW
EXECUTE FUNCTION update_compliance_issues_timestamp();

CREATE OR REPLACE FUNCTION update_compliance_remediation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER compliance_remediation_update_timestamp
BEFORE UPDATE ON compliance_remediation_plan
FOR EACH ROW
EXECUTE FUNCTION update_compliance_remediation_timestamp();

-- Create materialized view for compliance dashboard
CREATE MATERIALIZED VIEW compliance_dashboard_summary AS
SELECT 
    u.id as user_id,
    COUNT(DISTINCT CASE WHEN ca.compliance_status = 'compliant' THEN ca.id END) as compliant_assessments,
    COUNT(DISTINCT CASE WHEN ca.compliance_status = 'partially_compliant' THEN ca.id END) as partially_compliant_assessments,
    COUNT(DISTINCT CASE WHEN ca.compliance_status = 'non_compliant' THEN ca.id END) as non_compliant_assessments,
    COUNT(DISTINCT ca.id) as total_assessments,
    AVG(ca.overall_compliance_percentage) as avg_compliance_score,
    COUNT(DISTINCT CASE WHEN ci.risk_level = 'critical' THEN ci.id END) as critical_issues_count,
    COUNT(DISTINCT CASE WHEN ci.status = 'open' THEN ci.id END) as open_issues_count,
    MAX(ca.created_at) as last_assessment_date
FROM auth.users u
LEFT JOIN compliance_assessments ca ON u.id = ca.user_id
LEFT JOIN compliance_issues ci ON ca.id = ci.assessment_id
GROUP BY u.id;

-- Create index on materialized view
CREATE INDEX idx_compliance_dashboard_user_id ON compliance_dashboard_summary(user_id);

-- Grant permissions to authenticated users
GRANT SELECT ON compliance_assessments TO authenticated;
GRANT SELECT ON compliance_issues TO authenticated;
GRANT SELECT ON compliance_reports TO authenticated;
GRANT SELECT ON compliance_evidence TO authenticated;
GRANT SELECT ON compliance_remediation_plan TO authenticated;
GRANT SELECT ON compliance_dashboard_summary TO authenticated;

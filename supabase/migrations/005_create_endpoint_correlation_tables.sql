-- Supabase Migration: Endpoint Inventory & Correlation Tables
-- This creates master endpoint tracking and correlation linking

-- Endpoint Inventory (Master list of endpoints)
CREATE TABLE IF NOT EXISTS endpoint_inventory (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    endpoint_id TEXT NOT NULL,
    endpoint_url TEXT NOT NULL,
    method TEXT NOT NULL DEFAULT 'GET',
    status TEXT NOT NULL DEFAULT 'active',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP,
    last_seen TIMESTAMP,
    UNIQUE(user_id, endpoint_id),
    CONSTRAINT fk_user_id FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Endpoint Correlations (Links endpoints to data sources)
CREATE TABLE IF NOT EXISTS endpoint_correlations (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    endpoint_id TEXT NOT NULL,
    source TEXT NOT NULL,
    source_id TEXT NOT NULL,
    source_data JSONB DEFAULT '{}',
    linked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_user_id FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
    CONSTRAINT fk_endpoint_id FOREIGN KEY (endpoint_id) REFERENCES endpoint_inventory(endpoint_id) ON DELETE CASCADE
);

-- Create indexes for common queries
CREATE INDEX idx_endpoint_inventory_user_id ON endpoint_inventory(user_id);
CREATE INDEX idx_endpoint_inventory_endpoint_id ON endpoint_inventory(endpoint_id);
CREATE INDEX idx_endpoint_inventory_status ON endpoint_inventory(status);
CREATE INDEX idx_endpoint_inventory_method ON endpoint_inventory(method);
CREATE INDEX idx_endpoint_inventory_last_seen ON endpoint_inventory(last_seen DESC);
CREATE INDEX idx_endpoint_inventory_url ON endpoint_inventory(endpoint_url);

CREATE INDEX idx_endpoint_correlations_user_id ON endpoint_correlations(user_id);
CREATE INDEX idx_endpoint_correlations_endpoint_id ON endpoint_correlations(endpoint_id);
CREATE INDEX idx_endpoint_correlations_source ON endpoint_correlations(source);
CREATE INDEX idx_endpoint_correlations_linked_at ON endpoint_correlations(linked_at DESC);
CREATE INDEX idx_endpoint_correlations_source_id ON endpoint_correlations(source_id);

-- Enable RLS
ALTER TABLE endpoint_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE endpoint_correlations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for endpoint_inventory
CREATE POLICY "Users can view own endpoints" ON endpoint_inventory
    FOR SELECT
    USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert own endpoints" ON endpoint_inventory
    FOR INSERT
    WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update own endpoints" ON endpoint_inventory
    FOR UPDATE
    USING (auth.uid()::text = user_id);

-- RLS Policies for endpoint_correlations
CREATE POLICY "Users can view own correlations" ON endpoint_correlations
    FOR SELECT
    USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert own correlations" ON endpoint_correlations
    FOR INSERT
    WITH CHECK (auth.uid()::text = user_id);

-- Comments
COMMENT ON TABLE endpoint_inventory IS 'Master inventory of all discovered endpoints per user';
COMMENT ON TABLE endpoint_correlations IS 'Linkage between endpoints and data sources (scans, costs, risks)';

COMMENT ON COLUMN endpoint_inventory.endpoint_id IS 'Consistent identifier (SHA256-based) for correlation across scans';
COMMENT ON COLUMN endpoint_inventory.status IS 'Lifecycle status: active, deprecated, archived, removed';
COMMENT ON COLUMN endpoint_inventory.last_seen IS 'Last time endpoint appeared in a scan';

COMMENT ON COLUMN endpoint_correlations.source IS 'Data source type: postman_scan, llm_usage, risk_score, etc.';
COMMENT ON COLUMN endpoint_correlations.source_id IS 'ID of the record in the source table';
COMMENT ON COLUMN endpoint_correlations.source_data IS 'Cached snapshot of source data for quick queries';

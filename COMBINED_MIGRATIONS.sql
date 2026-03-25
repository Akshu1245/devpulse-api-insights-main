-- Combined Migrations
-- Run in Supabase SQL Editor

-- ========================================
-- Migration: 20260308105514_1f8feff0-84a6-45f5-a107-83259268a8b8.sql
-- ========================================


-- Create enum for agent status
CREATE TYPE public.agent_status AS ENUM ('active', 'paused', 'stopped', 'error');

-- Create enum for alert severity
CREATE TYPE public.alert_severity AS ENUM ('info', 'warning', 'critical');

-- Create enum for alert type
CREATE TYPE public.alert_type AS ENUM ('cost_limit', 'loop_detected', 'key_leak', 'rate_limit', 'error');

-- Profiles table
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  plan TEXT NOT NULL DEFAULT 'free',
  max_agents INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Agents table
CREATE TABLE public.agents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  framework TEXT,
  status agent_status NOT NULL DEFAULT 'active',
  max_cost_per_task NUMERIC(10,2) DEFAULT 2.00,
  max_api_calls_per_min INT DEFAULT 50,
  max_reasoning_steps INT DEFAULT 25,
  total_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_api_calls INT NOT NULL DEFAULT 0,
  total_tasks INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Agent logs
CREATE TABLE public.agent_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id TEXT,
  step_number INT NOT NULL DEFAULT 1,
  action_type TEXT NOT NULL,
  provider TEXT,
  model TEXT,
  input_tokens INT DEFAULT 0,
  output_tokens INT DEFAULT 0,
  cost NUMERIC(10,6) DEFAULT 0,
  latency_ms INT DEFAULT 0,
  status_code INT,
  is_loop_detected BOOLEAN DEFAULT false,
  raw_log JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cost entries
CREATE TABLE public.cost_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  model TEXT,
  cost NUMERIC(10,6) NOT NULL DEFAULT 0,
  api_calls INT NOT NULL DEFAULT 0,
  input_tokens INT DEFAULT 0,
  output_tokens INT DEFAULT 0,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Alerts
CREATE TABLE public.alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  alert_type alert_type NOT NULL,
  severity alert_severity NOT NULL DEFAULT 'warning',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Agent API keys
CREATE TABLE public.agent_api_keys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES public.agents(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  key_alias TEXT NOT NULL,
  last_four TEXT,
  is_leaked BOOLEAN NOT NULL DEFAULT false,
  leak_detected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_api_keys ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Agents policies
CREATE POLICY "Users can view own agents" ON public.agents FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own agents" ON public.agents FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own agents" ON public.agents FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own agents" ON public.agents FOR DELETE USING (auth.uid() = user_id);

-- Agent logs policies
CREATE POLICY "Users can view own logs" ON public.agent_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own logs" ON public.agent_logs FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Cost entries policies
CREATE POLICY "Users can view own costs" ON public.cost_entries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own costs" ON public.cost_entries FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Alerts policies
CREATE POLICY "Users can view own alerts" ON public.alerts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own alerts" ON public.alerts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own alerts" ON public.alerts FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Agent API keys policies
CREATE POLICY "Users can view own api keys" ON public.agent_api_keys FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own api keys" ON public.agent_api_keys FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own api keys" ON public.agent_api_keys FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own api keys" ON public.agent_api_keys FOR DELETE USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_agents_user_id ON public.agents(user_id);
CREATE INDEX idx_agent_logs_agent_id ON public.agent_logs(agent_id);
CREATE INDEX idx_agent_logs_task_id ON public.agent_logs(task_id);
CREATE INDEX idx_agent_logs_created_at ON public.agent_logs(created_at DESC);
CREATE INDEX idx_cost_entries_user_date ON public.cost_entries(user_id, date);
CREATE INDEX idx_cost_entries_agent_date ON public.cost_entries(agent_id, date);
CREATE INDEX idx_alerts_user_id ON public.alerts(user_id, created_at DESC);
CREATE INDEX idx_alerts_unread ON public.alerts(user_id, is_read) WHERE NOT is_read;

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_agents_updated_at BEFORE UPDATE ON public.agents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ========================================
-- Migration: 20260308110847_20f1b925-4dd2-45a9-9c3e-b8f93d4b937e.sql
-- ========================================


-- Audit log table
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES public.agents(id) ON DELETE SET NULL,
  action text NOT NULL,
  details jsonb DEFAULT '{}',
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own audit logs" ON public.audit_log
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own audit logs" ON public.audit_log
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Enable realtime on agent_logs
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_logs;


-- ========================================
-- Migration: 20260308145535_206ffc80-0a73-4262-8ccf-ec8e9050398d.sql
-- ========================================


-- Webhook configurations table
CREATE TABLE public.webhook_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  url text NOT NULL,
  webhook_type text NOT NULL DEFAULT 'slack', -- slack, discord, email
  events text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.webhook_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own webhooks" ON public.webhook_configs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own webhooks" ON public.webhook_configs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own webhooks" ON public.webhook_configs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own webhooks" ON public.webhook_configs FOR DELETE USING (auth.uid() = user_id);

-- Teams table
CREATE TABLE public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

-- Team members table
CREATE TABLE public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'viewer', -- admin, viewer
  invited_email text,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(team_id, user_id)
);

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- Teams RLS: owner can do everything, members can view
CREATE POLICY "Team owners can manage teams" ON public.teams FOR ALL USING (auth.uid() = owner_id);
CREATE POLICY "Team members can view teams" ON public.teams FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.team_members WHERE team_members.team_id = teams.id AND team_members.user_id = auth.uid())
);

-- Team members RLS
CREATE POLICY "Team owners can manage members" ON public.team_members FOR ALL USING (
  EXISTS (SELECT 1 FROM public.teams WHERE teams.id = team_members.team_id AND teams.owner_id = auth.uid())
);
CREATE POLICY "Members can view team members" ON public.team_members FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.team_id = team_members.team_id AND tm.user_id = auth.uid())
);


-- ========================================
-- Migration: 20260308180705_cb10d972-987d-43f6-88ed-fda5c8b15ffa.sql
-- ========================================

-- Allow team members to view agents belonging to the team owner
CREATE POLICY "Team members can view team agents"
ON public.agents
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.team_members tm
    JOIN public.teams t ON t.id = tm.team_id
    WHERE tm.user_id = auth.uid()
    AND t.owner_id = agents.user_id
  )
);

-- Allow team admins to update agents belonging to team owner
CREATE POLICY "Team admins can update team agents"
ON public.agents
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.team_members tm
    JOIN public.teams t ON t.id = tm.team_id
    WHERE tm.user_id = auth.uid()
    AND t.owner_id = agents.user_id
    AND tm.role = 'admin'
  )
);

-- Allow team members to view team alerts
CREATE POLICY "Team members can view team alerts"
ON public.alerts
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.team_members tm
    JOIN public.teams t ON t.id = tm.team_id
    WHERE tm.user_id = auth.uid()
    AND t.owner_id = alerts.user_id
  )
);

-- Allow team members to view team cost entries
CREATE POLICY "Team members can view team costs"
ON public.cost_entries
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.team_members tm
    JOIN public.teams t ON t.id = tm.team_id
    WHERE tm.user_id = auth.uid()
    AND t.owner_id = cost_entries.user_id
  )
);

-- Allow team members to view team agent logs
CREATE POLICY "Team members can view team logs"
ON public.agent_logs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.team_members tm
    JOIN public.teams t ON t.id = tm.team_id
    WHERE tm.user_id = auth.uid()
    AND t.owner_id = agent_logs.user_id
  )
);

-- ========================================
-- Migration: 20260319100000_add_user_api_keys.sql
-- ========================================

-- User API keys table for api-proxy (stores encrypted keys for proxied API calls)
CREATE TABLE public.user_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  encrypted_key text NOT NULL,
  key_alias text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own api keys" ON public.user_api_keys
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own api keys" ON public.user_api_keys
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own api keys" ON public.user_api_keys
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own api keys" ON public.user_api_keys
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_user_api_keys_user_id ON public.user_api_keys(user_id);


-- ========================================
-- Migration: 20260319120000_add_budget_amount.sql
-- ========================================

-- Pre-paid budget per agent: pause when total_cost >= budget_amount
ALTER TABLE public.agents
ADD COLUMN IF NOT EXISTS budget_amount NUMERIC(10,2) DEFAULT NULL;

COMMENT ON COLUMN public.agents.budget_amount IS 'Optional pre-paid budget. Agent should pause when total_cost >= budget_amount.';


-- ========================================
-- Migration: 20260319150000_high_traffic_indexes.sql
-- ========================================

-- High-traffic indexes for rate limiting, realtime, and dashboard queries
-- Optimizes: rate-limiter (agent_id + created_at), dashboards, audit logs

-- Composite index for rate-limiter: counts agent_logs by agent_id in last minute
CREATE INDEX IF NOT EXISTS idx_agent_logs_agent_created
  ON public.agent_logs(agent_id, created_at DESC);

-- Composite for user-scoped agent log queries (team/dashboard)
CREATE INDEX IF NOT EXISTS idx_agent_logs_user_created
  ON public.agent_logs(user_id, created_at DESC);

-- Audit log: user + time for pagination
CREATE INDEX IF NOT EXISTS idx_audit_log_user_created
  ON public.audit_log(user_id, created_at DESC);


-- ========================================
-- Migration: 20260321000000_add_audit_logging.sql
-- ========================================

-- Audit logging function for API key operations
-- (audit_log table and indexes already created in migrations 20260308110847 and 20260319150000)

-- Function to log audit events
CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_user_id uuid,
  p_action text,
  p_resource_type text,
  p_resource_id uuid DEFAULT NULL,
  p_details jsonb DEFAULT NULL,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_status text DEFAULT 'success',
  p_error_message text DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  v_log_id uuid;
BEGIN
  INSERT INTO public.audit_log (
    user_id,
    action,
    resource_type,
    resource_id,
    details,
    ip_address,
    user_agent,
    status,
    error_message
  ) VALUES (
    p_user_id,
    p_action,
    p_resource_type,
    p_resource_id,
    p_details,
    p_ip_address,
    p_user_agent,
    p_status,
    p_error_message
  )
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant audit logging function to authenticated users
GRANT EXECUTE ON FUNCTION public.log_audit_event TO authenticated;



-- Run this in your Supabase SQL Editor to set up the database

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create profiles table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  plan TEXT DEFAULT 'free',
  max_agents INTEGER DEFAULT 3,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own profile
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = user_id);

-- Policy: Users can update their own profile
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = user_id);

-- Policy: Users can insert their own profile
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Trigger to create profile when user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, user_id, display_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user signups
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create agents table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.agents (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  framework TEXT,
  status TEXT DEFAULT 'active',
  max_cost_per_task NUMERIC,
  max_api_calls_per_min INTEGER,
  max_reasoning_steps INTEGER,
  total_cost NUMERIC DEFAULT 0,
  total_api_calls INTEGER DEFAULT 0,
  total_tasks INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for agents
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own agents
CREATE POLICY "Users can view own agents" ON public.agents
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own agents" ON public.agents
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own agents" ON public.agents
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own agents" ON public.agents
  FOR DELETE USING (auth.uid() = user_id);

-- Create alerts table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.alerts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  alert_type TEXT NOT NULL,
  severity TEXT DEFAULT 'info',
  title TEXT NOT NULL,
  message TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for alerts
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own alerts
CREATE POLICY "Users can view own alerts" ON public.alerts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own alerts" ON public.alerts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own alerts" ON public.alerts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Create audit_log table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  details JSONB,
  ip_address INET,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for audit_log
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own audit logs
CREATE POLICY "Users can view own audit logs" ON public.audit_log
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own audit logs" ON public.audit_log
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Create agent_api_keys table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.agent_api_keys (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  agent_id UUID REFERENCES public.agents(id) ON DELETE CASCADE,
  key_alias TEXT NOT NULL,
  provider TEXT NOT NULL,
  last_four TEXT,
  is_leaked BOOLEAN DEFAULT FALSE,
  leak_detected_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for agent_api_keys
ALTER TABLE public.agent_api_keys ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own API keys
CREATE POLICY "Users can view own API keys" ON public.agent_api_keys
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own API keys" ON public.agent_api_keys
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own API keys" ON public.agent_api_keys
  FOR DELETE USING (auth.uid() = user_id);

-- Create agent_logs table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.agent_logs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  agent_id UUID REFERENCES public.agents(id) ON DELETE CASCADE NOT NULL,
  task_id UUID,
  step_number INTEGER DEFAULT 1,
  action_type TEXT NOT NULL,
  provider TEXT,
  model TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost NUMERIC,
  latency_ms INTEGER,
  status_code INTEGER,
  is_loop_detected BOOLEAN DEFAULT FALSE,
  raw_log JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for agent_logs
ALTER TABLE public.agent_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own logs
CREATE POLICY "Users can view own agent logs" ON public.agent_logs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own agent logs" ON public.agent_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Create cost_entries table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.cost_entries (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  agent_id UUID REFERENCES public.agents(id) ON DELETE CASCADE NOT NULL,
  provider TEXT NOT NULL,
  model TEXT,
  date DATE DEFAULT CURRENT_DATE,
  api_calls INTEGER DEFAULT 0,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for cost_entries
ALTER TABLE public.cost_entries ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own cost entries
CREATE POLICY "Users can view own cost entries" ON public.cost_entries
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own cost entries" ON public.cost_entries
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Create webhook_configs table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.webhook_configs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  webhook_type TEXT DEFAULT 'http',
  events TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for webhook_configs
ALTER TABLE public.webhook_configs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only manage their own webhooks
CREATE POLICY "Users can view own webhooks" ON public.webhook_configs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own webhooks" ON public.webhook_configs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own webhooks" ON public.webhook_configs
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own webhooks" ON public.webhook_configs
  FOR DELETE USING (auth.uid() = user_id);

-- Create teams table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.teams (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create team_members table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.team_members (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role TEXT DEFAULT 'member',
  invited_email TEXT,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(team_id, user_id)
);

-- Enable RLS for teams
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

-- Policy: Team owners can manage their teams
CREATE POLICY "Users can view own teams" ON public.teams
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Users can insert own teams" ON public.teams
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

-- Enable RLS for team_members
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- Policy: Team members can view their teams
CREATE POLICY "Users can view own team memberships" ON public.team_members
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own team memberships" ON public.team_members
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Grant permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;


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


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

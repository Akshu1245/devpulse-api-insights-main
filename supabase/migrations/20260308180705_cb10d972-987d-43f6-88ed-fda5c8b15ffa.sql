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
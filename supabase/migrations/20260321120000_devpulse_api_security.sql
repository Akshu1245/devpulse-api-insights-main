-- DevPulse API Security + LLM cost tables
-- NOTE: public.alerts already exists for AgentGuard (different schema).
-- Scanner alerts use security_alerts; the FastAPI routes remain /alerts/...

create extension if not exists "pgcrypto";

create table if not exists public.api_scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  method text not null,
  risk_level text not null,
  issue text not null,
  recommendation text not null,
  scanned_at timestamptz not null default now()
);

create table if not exists public.llm_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  model text not null,
  tokens_used integer not null default 0,
  cost_inr numeric not null default 0,
  recorded_at timestamptz not null default now()
);

create table if not exists public.security_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  severity text not null,
  description text not null,
  endpoint text not null,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.compliance_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  control_name text not null,
  status text not null,
  evidence text not null default '',
  checked_at timestamptz not null default now()
);

create index if not exists api_scans_user_scanned_idx on public.api_scans (user_id, scanned_at desc);
create index if not exists llm_usage_user_recorded_idx on public.llm_usage (user_id, recorded_at desc);
create index if not exists security_alerts_user_created_idx on public.security_alerts (user_id, created_at desc);
create index if not exists compliance_checks_user_idx on public.compliance_checks (user_id, control_name);

alter table public.api_scans enable row level security;
alter table public.llm_usage enable row level security;
alter table public.security_alerts enable row level security;
alter table public.compliance_checks enable row level security;

create policy "api_scans_select_own" on public.api_scans for select using (auth.uid() = user_id);
create policy "api_scans_insert_own" on public.api_scans for insert with check (auth.uid() = user_id);
create policy "api_scans_update_own" on public.api_scans for update using (auth.uid() = user_id);
create policy "api_scans_delete_own" on public.api_scans for delete using (auth.uid() = user_id);

create policy "llm_usage_select_own" on public.llm_usage for select using (auth.uid() = user_id);
create policy "llm_usage_insert_own" on public.llm_usage for insert with check (auth.uid() = user_id);
create policy "llm_usage_update_own" on public.llm_usage for update using (auth.uid() = user_id);
create policy "llm_usage_delete_own" on public.llm_usage for delete using (auth.uid() = user_id);

create policy "security_alerts_select_own" on public.security_alerts for select using (auth.uid() = user_id);
create policy "security_alerts_insert_own" on public.security_alerts for insert with check (auth.uid() = user_id);
create policy "security_alerts_update_own" on public.security_alerts for update using (auth.uid() = user_id);
create policy "security_alerts_delete_own" on public.security_alerts for delete using (auth.uid() = user_id);

create policy "compliance_checks_select_own" on public.compliance_checks for select using (auth.uid() = user_id);
create policy "compliance_checks_insert_own" on public.compliance_checks for insert with check (auth.uid() = user_id);
create policy "compliance_checks_update_own" on public.compliance_checks for update using (auth.uid() = user_id);
create policy "compliance_checks_delete_own" on public.compliance_checks for delete using (auth.uid() = user_id);

-- Worlo Teams Authentication Tables

-- 1. Team access codes table
-- This stores codes that users get from the Worlo website to log into the Teams app
create table if not exists public.team_access_codes (
  id                uuid        primary key default gen_random_uuid(),
  code              text        not null unique,
  agent_token_id    uuid        not null references public.agent_tokens(id) on delete cascade,
  agent_id          text        not null,
  is_active         boolean     not null default true,
  created_at        timestamptz not null default now(),
  expires_at        timestamptz,
  used_count        integer     not null default 0
);

-- Index for fast code lookups
create index if not exists team_access_codes_code_idx
  on public.team_access_codes (code);

create index if not exists team_access_codes_agent_token_idx
  on public.team_access_codes (agent_token_id);

-- 2. Team sessions table
-- This logs when users authenticate via a Teams access code
create table if not exists public.team_sessions (
  id                uuid        primary key default gen_random_uuid(),
  access_code_id    uuid        not null references public.team_access_codes(id) on delete cascade,
  agent_token_id    uuid        not null references public.agent_tokens(id) on delete cascade,
  user_first_name   text        not null,
  user_last_name    text        not null,
  user_email        text,
  ip_address        text,
  user_agent        text,
  created_at        timestamptz not null default now()
);

-- Indexes for lookups
create index if not exists team_sessions_access_code_idx
  on public.team_sessions (access_code_id);

create index if not exists team_sessions_agent_token_idx
  on public.team_sessions (agent_token_id);

create index if not exists team_sessions_created_at_idx
  on public.team_sessions (created_at desc);

-- Optional: If you want to track session activity (e.g., last message timestamp)
-- Uncomment and adjust as needed:
-- alter table public.team_sessions
--   add column last_activity_at timestamptz default now();

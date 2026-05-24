-- agent_connections: stores browserbase session IDs or OAuth tokens for connected apps

create table if not exists public.agent_connections (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null,
  agent_id          text        not null,
  app_name          text        not null, -- e.g., 'linkedin', 'google'
  session_id        text,                 -- For Browserbase sessions
  access_token      text,                 -- For OAuth tokens (if used later)
  connected_at      timestamptz not null default now(),
  
  unique(agent_id, app_name) -- one connection per app per agent
);

alter table public.agent_connections
  add constraint agent_connections_user_id_fkey
  foreign key (user_id)
  references auth.users (id)
  on delete cascade;

alter table public.agent_connections enable row level security;

create policy "agent_connections_select_policy"
  on public.agent_connections
  for select
  using (auth.uid() = user_id);

create policy "agent_connections_insert_policy"
  on public.agent_connections
  for insert
  with check (auth.uid() = user_id);

create policy "agent_connections_update_policy"
  on public.agent_connections
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "agent_connections_delete_policy"
  on public.agent_connections
  for delete
  using (auth.uid() = user_id);

create index agent_connections_user_id_idx
  on public.agent_connections (user_id);

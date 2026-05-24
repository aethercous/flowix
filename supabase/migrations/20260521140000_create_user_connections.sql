-- User-level OAuth connections (account-wide, linked to agents via agent_connections)

create table if not exists public.user_connections (
  id                  uuid        primary key default gen_random_uuid(),
  user_id             uuid        not null references auth.users (id) on delete cascade,
  provider            text        not null,
  account_label       text,
  external_account_id text,
  access_token        text,
  refresh_token       text,
  token_expires_at    timestamptz,
  scopes              text[],
  metadata            jsonb       not null default '{}'::jsonb,
  connected_at        timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (user_id, provider, external_account_id)
);

create index if not exists user_connections_user_id_idx
  on public.user_connections (user_id);

alter table public.user_connections enable row level security;

create policy "user_connections_select_policy"
  on public.user_connections for select
  using (auth.uid() = user_id);

create policy "user_connections_insert_policy"
  on public.user_connections for insert
  with check (auth.uid() = user_id);

create policy "user_connections_update_policy"
  on public.user_connections for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "user_connections_delete_policy"
  on public.user_connections for delete
  using (auth.uid() = user_id);

-- Short-lived OAuth state for CSRF protection
create table if not exists public.oauth_states (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users (id) on delete cascade,
  provider      text        not null,
  agent_id      text,
  return_url    text        not null default '/connections.html',
  expires_at    timestamptz not null,
  created_at    timestamptz not null default now()
);

create index if not exists oauth_states_expires_at_idx
  on public.oauth_states (expires_at);

alter table public.oauth_states enable row level security;

create policy "oauth_states_select_policy"
  on public.oauth_states for select
  using (auth.uid() = user_id);

create policy "oauth_states_insert_policy"
  on public.oauth_states for insert
  with check (auth.uid() = user_id);

create policy "oauth_states_delete_policy"
  on public.oauth_states for delete
  using (auth.uid() = user_id);

-- Link agent_connections to user-level OAuth tokens
alter table public.agent_connections
  add column if not exists user_connection_id uuid references public.user_connections (id) on delete set null;

create index if not exists agent_connections_user_connection_id_idx
  on public.agent_connections (user_connection_id);

-- Persistent Browserbase contexts per (user_connection) so agents reuse cookies
-- across sessions, plus a column on agent_connections so callers can read what
-- context will be used without joining through user_connections every time.

alter table public.user_connections
  add column if not exists browserbase_context_id text;

alter table public.agent_connections
  add column if not exists browserbase_context_id text;

create index if not exists user_connections_provider_idx
  on public.user_connections (user_id, provider);

create index if not exists agent_connections_agent_app_idx
  on public.agent_connections (agent_id, app_name);

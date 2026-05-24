-- User-scoped agent definitions (persistent across devices)

create table if not exists public.agents (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users (id) on delete cascade,
  name          text        not null,
  model         text        not null default 'claude-sonnet',
  system_prompt text        not null,
  allowed_urls  text[]      not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists agents_user_id_idx
  on public.agents (user_id, created_at desc);

alter table public.agents enable row level security;

drop policy if exists "agents_owner_select" on public.agents;
drop policy if exists "agents_owner_insert" on public.agents;
drop policy if exists "agents_owner_update" on public.agents;
drop policy if exists "agents_owner_delete" on public.agents;

create policy "agents_owner_select"
  on public.agents for select
  using (auth.uid() = user_id);

create policy "agents_owner_insert"
  on public.agents for insert
  with check (auth.uid() = user_id);

create policy "agents_owner_update"
  on public.agents for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "agents_owner_delete"
  on public.agents for delete
  using (auth.uid() = user_id);

-- Keep updated_at fresh
create or replace function public.set_agents_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists agents_updated_at on public.agents;
create trigger agents_updated_at
  before update on public.agents
  for each row execute function public.set_agents_updated_at();

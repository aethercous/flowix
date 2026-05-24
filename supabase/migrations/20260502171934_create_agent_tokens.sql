-- agent_tokens: stores API keys for invoking agents programmatically

create table if not exists public.agent_tokens (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null,
  agent_id          text        not null,
  api_key           text        not null unique,
  agent_config      jsonb       not null default '{}',
  llm_provider      text        not null default '',
  llm_key_encrypted text        not null default '',
  created_at        timestamptz not null default now()
);

alter table public.agent_tokens
  add constraint agent_tokens_user_id_fkey
  foreign key (user_id)
  references auth.users (id)
  on delete cascade;

alter table public.agent_tokens enable row level security;

create policy "agent_tokens_owner_policy"
  on public.agent_tokens
  for all
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index agent_tokens_api_key_idx
  on public.agent_tokens (api_key);

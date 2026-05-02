-- flowix - database schema
-- Paste this into Supabase Dashboard ->’ SQL Editor and click Run.
-- Safe to run multiple times.

-- -- 1. Create table --------------------------------------------------------
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

-- -- 2. Foreign key to auth.users (added separately so IF NOT EXISTS works) -
do $$
begin
  if not exists (
    select 1
    from   information_schema.table_constraints
    where  constraint_name = 'agent_tokens_user_id_fkey'
    and    table_name      = 'agent_tokens'
    and    table_schema    = 'public'
  ) then
    alter table public.agent_tokens
      add constraint agent_tokens_user_id_fkey
      foreign key (user_id)
      references auth.users (id)
      on delete cascade;
  end if;
end $$;

-- -- 3. Row Level Security --------------------------------------------------
alter table public.agent_tokens enable row level security;

-- Drop first so re-running this file never errors on "policy already exists"
drop policy if exists "agent_tokens_owner_policy" on public.agent_tokens;

create policy "agent_tokens_owner_policy"
  on public.agent_tokens
  for all
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- -- 4. Index for fast API key look-ups (used by the Edge Function) ---------
create index if not exists agent_tokens_api_key_idx
  on public.agent_tokens (api_key);

-- -- 5. User balance table for Stripe wallet/funds --------------------------
create table if not exists public.user_balance (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null unique references auth.users(id) on delete cascade,
  balance_usd decimal(12,2) not null default 0.00,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Enable RLS on user_balance
alter table public.user_balance enable row level security;

drop policy if exists "user_balance_owner_policy" on public.user_balance;

create policy "user_balance_owner_policy"
  on public.user_balance
  for all
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- -- 6. Transactions table for recording deposits/spend -----------------------
create table if not exists public.transactions (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  type        text        not null check (type in ('deposit', 'spend', 'refund')),
  amount_usd  decimal(12,2) not null,
  description text        not null default '',
  stripe_checkout_session_id text,
  created_at  timestamptz not null default now()
);

-- Enable RLS on transactions
alter table public.transactions enable row level security;

drop policy if exists "transactions_owner_policy" on public.transactions;

create policy "transactions_owner_policy"
  on public.transactions
  for all
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Index for fast lookups
create index if not exists transactions_user_id_idx on public.transactions (user_id, created_at desc);


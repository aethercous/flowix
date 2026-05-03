-- Create wallet and transactions tables for Stripe integration

-- User balance table
create table if not exists public.user_balance (
  user_id uuid primary key,
  balance_usd decimal(10,2) not null default 0.00,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Transactions table
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  type text not null check (type in ('wallet_deposit', 'usage')),
  amount_usd decimal(10,2) not null,
  description text,
  stripe_checkout_session_id text,
  created_at timestamptz not null default now()
);

-- RLS policies
alter table public.user_balance enable row level security;
alter table public.transactions enable row level security;

-- Users can only access their own balance
create policy "Users can view own balance" on public.user_balance for select using (auth.uid() = user_id);
create policy "Users can update own balance" on public.user_balance for update using (auth.uid() = user_id);
create policy "Users can insert own balance" on public.user_balance for insert with check (auth.uid() = user_id);

-- Users can only access their own transactions
create policy "Users can view own transactions" on public.transactions for select using (auth.uid() = user_id);
create policy "Users can insert own transactions" on public.transactions for insert with check (auth.uid() = user_id);

-- Indexes
create index if not exists idx_transactions_user_id on public.transactions(user_id);
create index if not exists idx_transactions_created_at on public.transactions(created_at);
create index if not exists idx_transactions_stripe_session on public.transactions(stripe_checkout_session_id);

-- Function to update updated_at timestamp
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Trigger to update updated_at
create trigger handle_user_balance_updated_at
  before update on public.user_balance
  for each row execute procedure public.handle_updated_at();

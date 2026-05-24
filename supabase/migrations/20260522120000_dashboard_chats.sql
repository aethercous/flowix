-- Dashboard agent chat threads and messages (saved per user)

create table if not exists public.dashboard_chats (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users (id) on delete cascade,
  agent_id    uuid        not null references public.agents (id) on delete cascade,
  title       text        not null default 'New chat',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists dashboard_chats_user_agent_idx
  on public.dashboard_chats (user_id, agent_id, updated_at desc);

create table if not exists public.dashboard_chat_messages (
  id          uuid        primary key default gen_random_uuid(),
  chat_id     uuid        not null references public.dashboard_chats (id) on delete cascade,
  role        text        not null check (role in ('user', 'assistant')),
  content     text        not null,
  created_at  timestamptz not null default now()
);

create index if not exists dashboard_chat_messages_chat_idx
  on public.dashboard_chat_messages (chat_id, created_at asc);

alter table public.dashboard_chats enable row level security;
alter table public.dashboard_chat_messages enable row level security;

drop policy if exists "dashboard_chats_owner_select" on public.dashboard_chats;
drop policy if exists "dashboard_chats_owner_insert" on public.dashboard_chats;
drop policy if exists "dashboard_chats_owner_update" on public.dashboard_chats;
drop policy if exists "dashboard_chats_owner_delete" on public.dashboard_chats;

create policy "dashboard_chats_owner_select"
  on public.dashboard_chats for select
  using (auth.uid() = user_id);

create policy "dashboard_chats_owner_insert"
  on public.dashboard_chats for insert
  with check (auth.uid() = user_id);

create policy "dashboard_chats_owner_update"
  on public.dashboard_chats for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "dashboard_chats_owner_delete"
  on public.dashboard_chats for delete
  using (auth.uid() = user_id);

drop policy if exists "dashboard_chat_messages_owner_select" on public.dashboard_chat_messages;
drop policy if exists "dashboard_chat_messages_owner_insert" on public.dashboard_chat_messages;
drop policy if exists "dashboard_chat_messages_owner_delete" on public.dashboard_chat_messages;

create policy "dashboard_chat_messages_owner_select"
  on public.dashboard_chat_messages for select
  using (
    exists (
      select 1 from public.dashboard_chats c
      where c.id = chat_id and c.user_id = auth.uid()
    )
  );

create policy "dashboard_chat_messages_owner_insert"
  on public.dashboard_chat_messages for insert
  with check (
    exists (
      select 1 from public.dashboard_chats c
      where c.id = chat_id and c.user_id = auth.uid()
    )
  );

create policy "dashboard_chat_messages_owner_delete"
  on public.dashboard_chat_messages for delete
  using (
    exists (
      select 1 from public.dashboard_chats c
      where c.id = chat_id and c.user_id = auth.uid()
    )
  );

create or replace function public.set_dashboard_chats_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists dashboard_chats_updated_at on public.dashboard_chats;
create trigger dashboard_chats_updated_at
  before update on public.dashboard_chats
  for each row execute function public.set_dashboard_chats_updated_at();

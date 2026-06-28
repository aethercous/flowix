-- Team members (joined via invite code) and group chat messages

create table if not exists public.team_members (
  id                uuid        primary key default gen_random_uuid(),
  access_code_id    uuid        not null references public.access_codes(id) on delete cascade,
  first_name        text        not null,
  last_name         text        not null,
  nickname          text,
  member_token      text        not null unique default encode(gen_random_bytes(32), 'hex'),
  is_active         boolean     not null default true,
  joined_at         timestamptz not null default now(),
  last_seen_at      timestamptz,
  kicked_at         timestamptz,
  created_at        timestamptz not null default now()
);

create index if not exists team_members_access_code_idx
  on public.team_members (access_code_id);

create index if not exists team_members_token_active_idx
  on public.team_members (member_token)
  where is_active = true;

create table if not exists public.team_messages (
  id                uuid        primary key default gen_random_uuid(),
  access_code_id    uuid        not null references public.access_codes(id) on delete cascade,
  member_id         uuid        not null references public.team_members(id) on delete cascade,
  sender_name       text        not null,
  body              text        not null,
  created_at        timestamptz not null default now()
);

create index if not exists team_messages_code_created_idx
  on public.team_messages (access_code_id, created_at desc);

alter table public.team_members enable row level security;
alter table public.team_messages enable row level security;

-- Edge functions use service role; no public policies

alter publication supabase_realtime add table public.team_messages;

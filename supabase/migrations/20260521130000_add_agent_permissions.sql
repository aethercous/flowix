-- Agent capability: read/navigate vs send/edit

alter table public.agents
  add column if not exists can_read_navigate boolean not null default true,
  add column if not exists can_send_edit boolean not null default false;

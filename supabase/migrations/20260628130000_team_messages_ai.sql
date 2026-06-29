-- Allow AI assistant replies in the team group chat.
-- AI messages have no team member, so member_id becomes nullable and an is_ai
-- flag distinguishes assistant messages from human ones.

alter table public.team_messages
  alter column member_id drop not null;

alter table public.team_messages
  add column if not exists is_ai boolean not null default false;

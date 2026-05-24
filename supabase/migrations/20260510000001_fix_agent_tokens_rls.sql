-- Fix RLS policy to allow access to system-generated tokens (NULL user_id)

drop policy if exists "agent_tokens_owner_policy" on public.agent_tokens;

-- New policy: allow access to:
-- 1. Tokens owned by the current user, OR
-- 2. System tokens (where user_id is NULL) - readable by anyone
create policy "agent_tokens_access_policy"
  on public.agent_tokens
  for all
  using      (auth.uid() = user_id OR user_id IS NULL)
  with check (auth.uid() = user_id);

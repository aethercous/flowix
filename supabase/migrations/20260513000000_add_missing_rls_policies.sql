-- Flowix: Add missing RLS policies for all tables
-- Run this in Supabase SQL Editor

-- ============================================================================
-- 1. team_access_codes - Enable RLS and add policies
-- ============================================================================

ALTER TABLE public.team_access_codes ENABLE ROW LEVEL SECURITY;

-- Only the agent owner can view/manage team access codes
-- We join through agent_tokens to check ownership
DROP POLICY IF EXISTS "team_access_codes_select_policy" ON public.team_access_codes;
CREATE POLICY "team_access_codes_select_policy"
  ON public.team_access_codes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.agent_tokens
      WHERE agent_tokens.id = team_access_codes.agent_token_id
        AND (agent_tokens.user_id = auth.uid() OR agent_tokens.user_id IS NULL)
    )
  );

DROP POLICY IF EXISTS "team_access_codes_insert_policy" ON public.team_access_codes;
CREATE POLICY "team_access_codes_insert_policy"
  ON public.team_access_codes
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.agent_tokens
      WHERE agent_tokens.id = team_access_codes.agent_token_id
        AND agent_tokens.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "team_access_codes_update_policy" ON public.team_access_codes;
CREATE POLICY "team_access_codes_update_policy"
  ON public.team_access_codes
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.agent_tokens
      WHERE agent_tokens.id = team_access_codes.agent_token_id
        AND agent_tokens.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "team_access_codes_delete_policy" ON public.team_access_codes;
CREATE POLICY "team_access_codes_delete_policy"
  ON public.team_access_codes
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.agent_tokens
      WHERE agent_tokens.id = team_access_codes.agent_token_id
        AND agent_tokens.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 2. team_sessions - Enable RLS and add policies
-- ============================================================================

ALTER TABLE public.team_sessions ENABLE ROW LEVEL SECURITY;

-- Only the agent owner can view team sessions
DROP POLICY IF EXISTS "team_sessions_select_policy" ON public.team_sessions;
CREATE POLICY "team_sessions_select_policy"
  ON public.team_sessions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.agent_tokens
      WHERE agent_tokens.id = team_sessions.agent_token_id
        AND (agent_tokens.user_id = auth.uid() OR agent_tokens.user_id IS NULL)
    )
  );

-- Insert is done via service_role in edge functions, not directly by users
-- But we add a policy for completeness
DROP POLICY IF EXISTS "team_sessions_insert_policy" ON public.team_sessions;
CREATE POLICY "team_sessions_insert_policy"
  ON public.team_sessions
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.agent_tokens
      WHERE agent_tokens.id = team_sessions.agent_token_id
        AND (agent_tokens.user_id = auth.uid() OR agent_tokens.user_id IS NULL)
    )
  );

-- ============================================================================
-- 3. access_codes - Add missing policies (RLS is already enabled)
-- ============================================================================

-- Only the agent owner can view/manage access codes
DROP POLICY IF EXISTS "access_codes_select_policy" ON public.access_codes;
CREATE POLICY "access_codes_select_policy"
  ON public.access_codes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.agent_tokens
      WHERE agent_tokens.id = access_codes.agent_token_id
        AND (agent_tokens.user_id = auth.uid() OR agent_tokens.user_id IS NULL)
    )
  );

DROP POLICY IF EXISTS "access_codes_insert_policy" ON public.access_codes;
CREATE POLICY "access_codes_insert_policy"
  ON public.access_codes
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.agent_tokens
      WHERE agent_tokens.id = access_codes.agent_token_id
        AND agent_tokens.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "access_codes_update_policy" ON public.access_codes;
CREATE POLICY "access_codes_update_policy"
  ON public.access_codes
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.agent_tokens
      WHERE agent_tokens.id = access_codes.agent_token_id
        AND (agent_tokens.user_id = auth.uid() OR agent_tokens.user_id IS NULL)
    )
  );

DROP POLICY IF EXISTS "access_codes_delete_policy" ON public.access_codes;
CREATE POLICY "access_codes_delete_policy"
  ON public.access_codes
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.agent_tokens
      WHERE agent_tokens.id = access_codes.agent_token_id
        AND agent_tokens.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 4. code_access_logs - Add missing policies (RLS is already enabled)
-- ============================================================================

-- Only the agent owner can view access logs (via access_codes -> agent_tokens)
DROP POLICY IF EXISTS "code_access_logs_select_policy" ON public.code_access_logs;
CREATE POLICY "code_access_logs_select_policy"
  ON public.code_access_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.access_codes
      JOIN public.agent_tokens ON agent_tokens.id = access_codes.agent_token_id
      WHERE access_codes.id = code_access_logs.code_id
        AND (agent_tokens.user_id = auth.uid() OR agent_tokens.user_id IS NULL)
    )
  );

-- Insert is done via service_role in edge functions
-- Allow insert for completeness
DROP POLICY IF EXISTS "code_access_logs_insert_policy" ON public.code_access_logs;
CREATE POLICY "code_access_logs_insert_policy"
  ON public.code_access_logs
  FOR INSERT
  WITH CHECK (true); -- Logs can be inserted by edge functions (service_role bypasses RLS anyway)

-- Teams sharing: per-agent kill switch and code metadata for labels

ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS teams_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.agents.teams_enabled IS
  'When false, all Teams invite codes for this agent are rejected at login.';

CREATE INDEX IF NOT EXISTS agents_teams_enabled_idx
  ON public.agents (user_id, teams_enabled);

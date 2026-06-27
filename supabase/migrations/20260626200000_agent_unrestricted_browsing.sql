-- Allow agents to browse any website (not limited to allowed_urls).
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS unrestricted_browsing boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.agents.unrestricted_browsing IS
  'When true, the agent may browse any URL. OAuth tokens from linked connections are still injected for matching sites.';

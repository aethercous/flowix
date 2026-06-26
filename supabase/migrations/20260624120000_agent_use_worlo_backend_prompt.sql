-- Per-agent toggle for worlo's OpenAI backend prompt (on by default).
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS use_worlo_backend_prompt boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.agents.use_worlo_backend_prompt IS
  'When true, OpenAI agents use worlo''s backend prompt wrapper. When false, only the agent system prompt is sent.';

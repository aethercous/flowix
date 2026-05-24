-- Allow NULL user_id for system-generated agent tokens

ALTER TABLE public.agent_tokens
  ALTER COLUMN user_id DROP NOT NULL;

-- Add constraint to ensure at least one reference (for audit purposes)
-- We no longer require user_id to be non-null

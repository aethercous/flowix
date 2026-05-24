-- Create access codes table with hashed codes (new secure system)
CREATE TABLE IF NOT EXISTS public.access_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hashed_code text UNIQUE NOT NULL,
  agent_token_id uuid NOT NULL REFERENCES public.agent_tokens(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone NOT NULL,
  used_count integer DEFAULT 0,
  max_uses integer DEFAULT 1,
  is_active boolean DEFAULT true,
  metadata jsonb DEFAULT '{}'::jsonb
);

-- Create code access logs table for audit trail
CREATE TABLE IF NOT EXISTS public.code_access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_id uuid REFERENCES public.access_codes(id) ON DELETE CASCADE,
  ip_address text,
  user_agent text,
  first_name text,
  last_name text,
  success boolean NOT NULL,
  error_reason text,
  timestamp timestamp with time zone DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.access_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.code_access_logs ENABLE ROW LEVEL SECURITY;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_access_codes_hashed_code ON public.access_codes(hashed_code);
CREATE INDEX IF NOT EXISTS idx_access_codes_agent_token_id ON public.access_codes(agent_token_id);
CREATE INDEX IF NOT EXISTS idx_access_codes_expires_at ON public.access_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_code_access_logs_code_id ON public.code_access_logs(code_id);
CREATE INDEX IF NOT EXISTS idx_code_access_logs_timestamp ON public.code_access_logs(timestamp);

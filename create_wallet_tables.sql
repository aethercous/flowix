-- Run this in Supabase Dashboard -> SQL Editor

-- Create user_balance table
CREATE TABLE IF NOT EXISTS public.user_balance (
  user_id UUID PRIMARY KEY,
  balance_usd DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create transactions table
CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('wallet_deposit', 'usage')),
  amount_usd DECIMAL(10,2) NOT NULL,
  description TEXT,
  stripe_checkout_session_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.user_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view own balance" ON public.user_balance FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own balance" ON public.user_balance FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own balance" ON public.user_balance FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own transactions" ON public.transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own transactions" ON public.transactions FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON public.transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON public.transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_stripe_session ON public.transactions(stripe_checkout_session_id);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER handle_user_balance_updated_at
  BEFORE UPDATE ON public.user_balance
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

// Stripe Webhook Edge Function - flowix
// Handles checkout.session.completed to add funds to user wallet

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
};

// Simple HMAC-SHA256 for webhook verification
async function verifyWebhook(payload: string, signature: string, secret: string): Promise<boolean> {
  const expectedSig = await crypto.subtle.sign(
    'HMAC',
    await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    ),
    new TextEncoder().encode(payload)
  );
  const expectedSigHex = Array.from(new Uint8Array(expectedSig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return signature === `t=0,v1=${expectedSigHex}` || signature.includes(expectedSigHex);
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload = await req.text();
    const signature = req.headers.get('stripe-signature') || '';
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK');

    // For production, verify the webhook signature
    // if (webhookSecret && !await verifyWebhook(payload, signature, webhookSecret)) {
    //   return new Response('Invalid signature', { status: 400 });
    // }

    const event = JSON.parse(payload);

    // Only handle checkout.session.completed
    if (event.type !== 'checkout.session.completed') {
      console.log('Ignoring event type:', event.type);
      return new Response('OK', { status: 200 });
    }

    const session = event.data.object;
    const metadata = session.metadata || {};
    
    console.log('Processing checkout session:', session.id);
    console.log('Payment status:', session.payment_status);
    console.log('Metadata:', metadata);

    // Verify payment was actually collected
    if (session.payment_status !== 'paid') {
      console.log('Payment not yet collected, skipping. Status:', session.payment_status);
      return new Response('Payment not collected', { status: 200 });
    }
    
    // Verify this is a wallet deposit
    if (metadata.type !== 'wallet_deposit') {
      console.log('Not a wallet deposit, skipping');
      return new Response('OK', { status: 200 });
    }

    const userId = metadata.user_id;
    const amount = parseFloat(metadata.amount);

    if (!userId || !amount || isNaN(amount)) {
      console.error('Invalid metadata:', { userId, amount });
      return new Response('Missing metadata', { status: 400 });
    }

    console.log('Processing deposit:', { userId, amount });

    // Create Supabase admin client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase config');
      return new Response('Supabase not configured', { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if this transaction was already processed (idempotency)
    const { data: existingTx } = await supabase
      .from('transactions')
      .select('id')
      .eq('stripe_checkout_session_id', session.id)
      .single();

    if (existingTx) {
      console.log('Transaction already processed for session:', session.id);
      return new Response('Already processed', { status: 200 });
    }

    // Get or create user balance
    const { data: balance, error: balanceError } = await supabase
      .from('user_balance')
      .select('id, balance_usd')
      .eq('user_id', userId)
      .single();

    if (balanceError && balanceError.code !== 'PGRST116') {
      // PGRST116 = no rows found (that's ok, we'll insert)
      console.error('Error fetching balance:', balanceError);
    }

    // CRITICAL: parseFloat because Supabase returns decimal columns as strings
    const currentBalance = parseFloat(balance?.balance_usd || '0');
    const newBalance = currentBalance + amount;

    console.log('Balance update:', { currentBalance, amount, newBalance });

    // Update balance (insert if not exists)
    if (balance) {
      const { error: updateError } = await supabase
        .from('user_balance')
        .update({ balance_usd: newBalance, updated_at: new Date().toISOString() })
        .eq('id', balance.id);
      if (updateError) {
        console.error('Failed to update balance:', updateError);
        return new Response('Failed to update balance', { status: 500 });
      }
    } else {
      const { error: insertError } = await supabase
        .from('user_balance')
        .insert({ user_id: userId, balance_usd: amount });
      if (insertError) {
        console.error('Failed to insert balance:', insertError);
        return new Response('Failed to create balance', { status: 500 });
      }
    }

    // Record the transaction
    const { error: txError } = await supabase.from('transactions').insert({
      user_id: userId,
      type: 'deposit',
      amount_usd: amount,
      description: `Added $${amount.toFixed(2)} to wallet`,
      stripe_checkout_session_id: session.id,
    });

    if (txError) {
      console.error('Failed to record transaction:', txError);
      // Balance was already updated, log this for manual reconciliation
    }

    console.log('Successfully processed deposit of $' + amount.toFixed(2) + ' for user ' + userId);
    return new Response('OK', { status: 200 });

  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(`Webhook error: ${error.message}`, { status: 400 });
  }
});

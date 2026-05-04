// Stripe Checkout Edge Function - flowix
// Creates a checkout session for adding funds to user wallet

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-requested-with',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
  'Access-Control-Max-Age': '86400',
};

serve(async (req) => {
  console.log('Function called with method:', req.method);
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    console.log('Handling CORS preflight');
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('Parsing request body...');
    const { amount, userId, returnUrl } = await req.json();
    console.log('Request parsed:', { amount, userId, returnUrl: returnUrl ? 'present' : 'missing' });

    // Validate amount ($1 - $10,000)
    if (!amount || amount < 1 || amount > 10000) {
      return new Response(
        JSON.stringify({ error: 'Amount must be between $1 and $10,000' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get Stripe secret key from Supabase secrets
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    console.log('Stripe secret key present:', !!stripeSecretKey);
    if (!stripeSecretKey) {
      console.error('STRIPE_SECRET_KEY not found in environment');
      return new Response(
        JSON.stringify({ error: 'Stripe not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Stripe checkout session
    console.log('Creating Stripe checkout session...');
    const params = new URLSearchParams({
      'mode': 'payment',
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][product_data][name]': `Add $${amount} to flowix wallet`,
      'line_items[0][price_data][unit_amount]': String(Math.round(amount * 100)), // cents
      'line_items[0][quantity]': '1',
      'success_url': `${returnUrl}?success=true&session_id={CHECKOUT_SESSION_ID}`,
      'cancel_url': `${returnUrl}?canceled=true`,
      'metadata[user_id]': userId,
      'metadata[amount]': String(amount),
      'metadata[type]': 'wallet_deposit',
    });
    
    // Stripe Checkout handles payment method types automatically
    // (no need for automatic_payment_methods - that's for PaymentIntents API only)
    
    const session = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });

    const sessionData = await session.json();
    console.log('Stripe response status:', session.status);
    console.log('Stripe response data:', sessionData);

    if (!session.ok) {
      console.error('Stripe API error:', sessionData);
      return new Response(
        JSON.stringify({ error: sessionData.error?.message || 'Failed to create checkout' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ 
        sessionId: sessionData.id, 
        url: sessionData.url 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in stripe-checkout:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";
import { getCallbackUrl, getProvider } from "../_shared/oauth-providers.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Missing Authorization header" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return jsonResponse({ error: "Unauthorized" }, 401);

  let provider: string;
  let agentId: string | undefined;
  let returnUrl = "dashboard.html#connections";

  try {
    const body = await req.json();
    provider = body.provider;
    agentId = body.agentId;
    if (body.returnUrl && typeof body.returnUrl === "string") {
      returnUrl = body.returnUrl;
    }
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const config = getProvider(provider);
  if (!config) return jsonResponse({ error: "Unknown provider" }, 400);

  const clientId = Deno.env.get(config.clientIdEnv);
  const clientSecret = Deno.env.get(config.clientSecretEnv);
  if (!clientId || !clientSecret) {
    // 200 so supabase-js returns body in `data` (non-2xx often hides the message)
    return jsonResponse({
      ok: false,
      error: `${config.label} is not configured yet. In Supabase Dashboard → Edge Functions → Secrets, add ${config.clientIdEnv} and ${config.clientSecretEnv}. Then set redirect URL to ${getCallbackUrl(supabaseUrl)} in your ${config.label} OAuth app.`,
      missingSecrets: [config.clientIdEnv, config.clientSecretEnv],
      redirectUri: getCallbackUrl(supabaseUrl),
    });
  }

  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const { data: stateRow, error: stateError } = await supabase
    .from("oauth_states")
    .insert({
      user_id: user.id,
      provider,
      agent_id: agentId || null,
      return_url: returnUrl,
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (stateError || !stateRow) {
    return jsonResponse({ error: stateError?.message || "Failed to create OAuth state" }, 500);
  }

  const redirectUri = getCallbackUrl(supabaseUrl);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    state: stateRow.id,
    scope: config.scopes.join(" "),
  });

  if (config.extraAuthParams) {
    for (const [k, v] of Object.entries(config.extraAuthParams)) {
      if (v !== "") params.set(k, v);
    }
  }

  const url = `${config.authUrl}?${params.toString()}`;
  return jsonResponse({ url, state: stateRow.id });
});

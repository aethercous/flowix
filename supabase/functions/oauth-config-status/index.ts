/**
 * Returns which OAuth providers are configured in Supabase secrets so the
 * dashboard can show inline "Needs setup" badges before the user clicks
 * Connect. No secret values are returned — only booleans + the env var names.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";
import { getCallbackUrl, OAUTH_PROVIDERS } from "../_shared/oauth-providers.ts";

serve((req: Request) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();
  if (req.method !== "GET" && req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const redirectUri = supabaseUrl ? getCallbackUrl(supabaseUrl) : null;

  const providers: Record<
    string,
    {
      label: string;
      configured: boolean;
      missing: string[];
      clientIdEnv: string;
      clientSecretEnv: string;
    }
  > = {};

  for (const [id, cfg] of Object.entries(OAUTH_PROVIDERS)) {
    const clientId = Deno.env.get(cfg.clientIdEnv);
    const clientSecret = Deno.env.get(cfg.clientSecretEnv);
    const missing: string[] = [];
    if (!clientId) missing.push(cfg.clientIdEnv);
    if (!clientSecret) missing.push(cfg.clientSecretEnv);
    providers[id] = {
      label: cfg.label,
      configured: missing.length === 0,
      missing,
      clientIdEnv: cfg.clientIdEnv,
      clientSecretEnv: cfg.clientSecretEnv,
    };
  }

  return jsonResponse({ providers, redirectUri });
});

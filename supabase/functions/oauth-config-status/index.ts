/**
 * Returns which OAuth providers are enabled on the platform. No secret values
 * or env var names are exposed — end users only see Connect vs Unavailable.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";
import { OAUTH_PROVIDERS } from "../_shared/oauth-providers.ts";

serve((req: Request) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();
  if (req.method !== "GET" && req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const providers: Record<string, { label: string; configured: boolean }> = {};

  for (const [id, cfg] of Object.entries(OAUTH_PROVIDERS)) {
    const clientId = Deno.env.get(cfg.clientIdEnv);
    const clientSecret = Deno.env.get(cfg.clientSecretEnv);
    providers[id] = {
      label: cfg.label,
      configured: Boolean(clientId && clientSecret),
    };
  }

  return jsonResponse({ providers });
});

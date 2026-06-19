import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";
import {
  applyProviderAuthToSession,
  ensureContextForUserConnection,
  getSessionConnectUrl,
} from "../_shared/browserbase-contexts.ts";
import {
  getBrowserProvider,
  getProviderLoginUrl,
} from "../_shared/connection-providers.ts";

const BROWSERBASE_SESSIONS = "https://www.browserbase.com/v1/sessions";

function bbApiKey(): string {
  const key = Deno.env.get("BROWSERBASE_API_KEY");
  if (!key) throw new Error("Browserbase API key is not configured");
  return key;
}

function bbProjectId(): string {
  const id = Deno.env.get("BROWSERBASE_PROJECT_ID");
  if (!id) throw new Error("Browserbase project id is not configured");
  return id;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Missing Authorization header" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return jsonResponse({ error: "Unauthorized" }, 401);

  let connectionId: string | undefined;
  let provider: string | undefined;
  try {
    const body = await req.json();
    connectionId = body.connectionId;
    provider = body.provider;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });

  let query = admin
    .from("user_connections")
    .select("id, provider, access_token, browserbase_context_id")
    .eq("user_id", user.id);

  if (connectionId) query = query.eq("id", connectionId);
  else if (provider) query = query.eq("provider", provider);
  else return jsonResponse({ error: "connectionId or provider required" }, 400);

  let { data: row, error: rowErr } = await query.maybeSingle();

  if (!row && provider) {
    const browserOnly = getBrowserProvider(provider);
    if (browserOnly?.usesContext) {
      const { data: created, error: createErr } = await admin
        .from("user_connections")
        .insert({
          user_id: user.id,
          provider,
          external_account_id: "default",
          account_label: provider.charAt(0).toUpperCase() + provider.slice(1),
          access_token: null,
          refresh_token: null,
          metadata: { browser_only: true },
        })
        .select("id, provider, access_token, browserbase_context_id")
        .single();
      if (!createErr && created) row = created;
    }
  }

  if (rowErr || !row) {
    return jsonResponse({ error: "Connection not found" }, 404);
  }

  const browserProvider = getBrowserProvider(row.provider);
  if (!browserProvider) {
    return jsonResponse({ error: "Provider does not support browser login" }, 400);
  }

  const startUrl = getProviderLoginUrl(row.provider);
  if (!startUrl) {
    return jsonResponse({ error: "No login URL configured for this provider" }, 400);
  }

  try {
    const contextId = await ensureContextForUserConnection(
      admin,
      row.id,
      row.browserbase_context_id,
    );

    const sessionPayload: Record<string, unknown> = {
      projectId: bbProjectId(),
      keepAlive: true,
      startUrl,
      browserSettings: { context: { id: contextId, persist: true } },
    };

    const res = await fetch(BROWSERBASE_SESSIONS, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-BB-API-Key": bbApiKey(),
      },
      body: JSON.stringify(sessionPayload),
    });

    if (!res.ok) {
      throw new Error(`Browserbase session creation failed: ${await res.text()}`);
    }

    const data = await res.json();
    const sessionId = data.id as string;
    let connectUrl = (data.connectUrl as string | undefined) ?? null;
    if (!connectUrl) connectUrl = await getSessionConnectUrl(sessionId);

    if (row.access_token) {
      await applyProviderAuthToSession(
        sessionId,
        connectUrl,
        browserProvider,
        row.access_token,
        contextId,
      );
    }

    return jsonResponse({
      sessionId,
      connectUrl: connectUrl ?? undefined,
      debugUrl: data.debugViewerUrl as string | undefined,
      provider: row.provider,
      message:
        "Sign in using the live browser view. Your session is saved to this connection's Browserbase context for future agent runs.",
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("connection-browser-login:", detail);
    return jsonResponse({ error: "Failed to open browser login", detail }, 500);
  }
});

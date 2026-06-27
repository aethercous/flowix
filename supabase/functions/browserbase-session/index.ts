import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isUrlAllowed } from "../_shared/url-allowlist.ts";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";
import {
  type AgentIdentity,
  buildBrowserRuntimeContext,
  createBrowserSession,
} from "../_shared/browser-runtime.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return jsonResponse({ error: "Missing or invalid Authorization header" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Validate the caller with RLS-bound client.
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  let agentId: string;
  let url: string | undefined;

  try {
    const body = await req.json();
    agentId = body.agentId;
    url = body.url;

    if (!agentId || typeof agentId !== "string") {
      return jsonResponse({ error: "agentId is required and must be a string" }, 400);
    }
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  // Service-role client for reading agent + connections so RLS doesn't block
  // joining through agent_connections → user_connections for the same user.
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });

  const { data: agentRow, error: agentError } = await adminClient
    .from("agents")
    .select("id, allowed_urls, unrestricted_browsing, can_read_navigate, can_send_edit, user_id")
    .eq("id", agentId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (agentError || !agentRow) {
    return jsonResponse({ error: "Agent not found or access denied" }, 404);
  }

  if (agentRow.can_read_navigate === false) {
    return jsonResponse({
      error: "This agent is not allowed to read or navigate the web",
    }, 403);
  }

  const identity: AgentIdentity = {
    userId: user.id,
    agentId,
    supabase: adminClient,
  };

  const ctx = buildBrowserRuntimeContext(agentRow, identity);

  if (!ctx.allowedUrls.length) {
    return jsonResponse({
      error: "No allowed websites configured for this agent. Add URLs in the dashboard first.",
    }, 403);
  }

  if (url && !isUrlAllowed(url, ctx.allowedUrls)) {
    return jsonResponse({
      error: "URL is not in this agent's allowed website list",
      allowed_urls: ctx.allowedUrls,
    }, 403);
  }

  try {
    const session = await createBrowserSession(ctx, url);
    return jsonResponse({
      sessionId: session.sessionId,
      connectUrl: session.connectUrl,
      debugUrl: session.debugUrl,
      attachedProviders: session.attachedProviders,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("Browserbase session error:", detail);
    return jsonResponse({ error: "Failed to create Browserbase session", detail }, 500);
  }
});

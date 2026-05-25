import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  type AgentIdentity,
  buildBrowserRuntimeContext,
  runBrowserAction,
  type BrowserActionName,
} from "../_shared/browser-runtime.ts";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";

interface BrowserAction {
  action: BrowserActionName;
  browserSessionId: string;
  url?: string;
  selector?: string;
  text?: string;
  scrollAmount?: number;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return corsPreflightResponse();
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const agentKey = req.headers.get("X-Agent-Key");
  if (!agentKey || !agentKey.startsWith("nra_")) {
    return jsonResponse({ error: "Missing or invalid X-Agent-Key header" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Server configuration error" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });

  const { data: tokenRow, error: dbError } = await supabase
    .from("agent_tokens")
    .select("id, user_id, agent_id")
    .eq("api_key", agentKey)
    .maybeSingle();

  if (dbError || !tokenRow) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  let body: BrowserAction;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { action, browserSessionId } = body;

  if (!browserSessionId) {
    return jsonResponse({ error: "browserSessionId is required" }, 400);
  }

  if (!action) {
    return jsonResponse({ error: "action is required" }, 400);
  }

  const { data: agentRow } = await supabase
    .from("agents")
    .select("allowed_urls, can_read_navigate, can_send_edit")
    .eq("id", tokenRow.agent_id)
    .maybeSingle();

  const identity: AgentIdentity = {
    userId: tokenRow.user_id,
    agentId: tokenRow.agent_id,
    supabase,
  };

  const ctx = buildBrowserRuntimeContext(agentRow ?? undefined, identity);

  try {
    const result = await runBrowserAction(
      browserSessionId,
      action,
      {
        url: body.url,
        selector: body.selector,
        text: body.text,
        scrollAmount: body.scrollAmount,
      },
      ctx,
    );
    return jsonResponse(result, 200);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("not allowed") || msg.includes("No allowed") || msg.includes("read-only")) {
      return jsonResponse({ error: msg }, 403);
    }
    console.error("Browser action failed:", error);
    return jsonResponse({ error: "Browser action failed", detail: msg }, 500);
  }
});

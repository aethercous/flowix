import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isUrlAllowed, parseAllowedUrls } from "../_shared/url-allowlist.ts";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return corsPreflightResponse();
  }

  // Only allow POST
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // ------------------------------------------------------------------
  // Validate Supabase JWT
  // ------------------------------------------------------------------
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return jsonResponse({ error: "Missing or invalid Authorization header" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Initialise the client with the caller's JWT so RLS applies
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  // ------------------------------------------------------------------
  // Parse request body
  // ------------------------------------------------------------------
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

  const { data: agentRow, error: agentError } = await supabase
    .from("agents")
    .select("id, allowed_urls, can_read_navigate, can_send_edit")
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

  const allowedUrls = parseAllowedUrls(agentRow.allowed_urls);
  if (!allowedUrls.length) {
    return jsonResponse({
      error: "No allowed websites configured for this agent. Add URLs in the dashboard first.",
    }, 403);
  }

  if (url && !isUrlAllowed(url, allowedUrls)) {
    return jsonResponse({
      error: "URL is not in this agent's allowed website list",
      allowed_urls: allowedUrls,
    }, 403);
  }

  // ------------------------------------------------------------------
  // Call Browserbase API to create a session
  // ------------------------------------------------------------------
  const bbApiKey = Deno.env.get("BROWSERBASE_API_KEY");
  const bbProjectId = Deno.env.get("BROWSERBASE_PROJECT_ID");

  if (!bbApiKey || !bbProjectId) {
    return jsonResponse({ error: "Browserbase credentials are not configured" }, 500);
  }

  const sessionPayload: Record<string, unknown> = {
    projectId: bbProjectId,
    keepAlive: true,
  };

  // Optionally set an initial URL if provided
  if (url) {
    sessionPayload.startUrl = url;
  }

  let bbResponse: Response;
  try {
    bbResponse = await fetch("https://www.browserbase.com/v1/sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-BB-API-Key": bbApiKey,
      },
      body: JSON.stringify(sessionPayload),
    });
  } catch (err) {
    console.error("Network error calling Browserbase:", err);
    return jsonResponse({ error: "Failed to reach Browserbase API" }, 500);
  }

  if (!bbResponse.ok) {
    let detail: string;
    try {
      const errBody = await bbResponse.json();
      detail = errBody.message ?? JSON.stringify(errBody);
    } catch {
      detail = await bbResponse.text();
    }
    console.error("Browserbase error:", bbResponse.status, detail);
    return jsonResponse(
      { error: "Browserbase session creation failed", detail },
      500,
    );
  }

  let bbData: Record<string, unknown>;
  try {
    bbData = await bbResponse.json();
  } catch {
    return jsonResponse({ error: "Unexpected response from Browserbase" }, 500);
  }

  // ------------------------------------------------------------------
  // Return the session info to the caller
  // ------------------------------------------------------------------
  const sessionId = bbData.id as string;
  const connectUrl = bbData.connectUrl as string | undefined;
  const debugUrl = bbData.debugViewerUrl as string | undefined;

  return jsonResponse({ sessionId, connectUrl, debugUrl });
});

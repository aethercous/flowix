import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";

type ManageAction =
  | "revoke"
  | "activate"
  | "set_expires"
  | "set_agent_teams_enabled"
  | "revoke_all_for_agent";

interface ManageRequest {
  action: ManageAction;
  access_code_id?: string;
  agent_id?: string;
  expires_at?: string;
  teams_enabled?: boolean;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  let body: ManageRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { action } = body;
  if (!action) return jsonResponse({ error: "action is required" }, 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Server configuration error" }, 500);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ") || !anonKey) {
    return jsonResponse({ error: "Authorization required" }, 401);
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) return jsonResponse({ error: "Unauthorized" }, 401);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });

  async function ownsAccessCode(codeId: string): Promise<boolean> {
    const { data } = await supabase
      .from("access_codes")
      .select("id, agent_token_id")
      .eq("id", codeId)
      .maybeSingle();
    if (!data) return false;
    const { data: token } = await supabase
      .from("agent_tokens")
      .select("user_id")
      .eq("id", data.agent_token_id)
      .maybeSingle();
    return token?.user_id === user.id;
  }

  async function ownsAgent(agentId: string): Promise<boolean> {
    const { data } = await supabase
      .from("agents")
      .select("id")
      .eq("id", agentId)
      .eq("user_id", user.id)
      .maybeSingle();
    return !!data;
  }

  try {
    if (action === "set_agent_teams_enabled") {
      const { agent_id, teams_enabled } = body;
      if (!agent_id) return jsonResponse({ error: "agent_id is required" }, 400);
      if (typeof teams_enabled !== "boolean") {
        return jsonResponse({ error: "teams_enabled must be a boolean" }, 400);
      }
      if (!(await ownsAgent(agent_id))) {
        return jsonResponse({ error: "Agent not found" }, 404);
      }
      const { error } = await supabase
        .from("agents")
        .update({ teams_enabled })
        .eq("id", agent_id)
        .eq("user_id", user.id);
      if (error) return jsonResponse({ error: "Failed to update agent" }, 500);
      return jsonResponse({ success: true, agent_id, teams_enabled });
    }

    if (action === "revoke_all_for_agent") {
      const { agent_id } = body;
      if (!agent_id) return jsonResponse({ error: "agent_id is required" }, 400);
      if (!(await ownsAgent(agent_id))) {
        return jsonResponse({ error: "Agent not found" }, 404);
      }
      const { data: tokens } = await supabase
        .from("agent_tokens")
        .select("id")
        .eq("agent_id", agent_id)
        .eq("user_id", user.id);
      const tokenIds = (tokens || []).map((t) => t.id);
      if (tokenIds.length === 0) {
        return jsonResponse({ success: true, revoked: 0 });
      }
      const { data: updated, error } = await supabase
        .from("access_codes")
        .update({ is_active: false })
        .in("agent_token_id", tokenIds)
        .select("id");
      if (error) return jsonResponse({ error: "Failed to revoke codes" }, 500);
      return jsonResponse({ success: true, revoked: updated?.length ?? 0 });
    }

    if (action === "revoke" || action === "activate") {
      const { access_code_id } = body;
      if (!access_code_id) return jsonResponse({ error: "access_code_id is required" }, 400);
      if (!(await ownsAccessCode(access_code_id))) {
        return jsonResponse({ error: "Code not found" }, 404);
      }
      const { error } = await supabase
        .from("access_codes")
        .update({ is_active: action === "activate" })
        .eq("id", access_code_id);
      if (error) return jsonResponse({ error: "Failed to update code" }, 500);
      return jsonResponse({ success: true, access_code_id, is_active: action === "activate" });
    }

    if (action === "set_expires") {
      const { access_code_id, expires_at } = body;
      if (!access_code_id || !expires_at) {
        return jsonResponse({ error: "access_code_id and expires_at are required" }, 400);
      }
      const exp = new Date(expires_at);
      if (Number.isNaN(exp.getTime())) {
        return jsonResponse({ error: "Invalid expires_at" }, 400);
      }
      if (!(await ownsAccessCode(access_code_id))) {
        return jsonResponse({ error: "Code not found" }, 404);
      }
      const { error } = await supabase
        .from("access_codes")
        .update({ expires_at: exp.toISOString() })
        .eq("id", access_code_id);
      if (error) return jsonResponse({ error: "Failed to update expiry" }, 500);
      return jsonResponse({ success: true, access_code_id, expires_at: exp.toISOString() });
    }

    return jsonResponse({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("manage-teams-code:", e);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});

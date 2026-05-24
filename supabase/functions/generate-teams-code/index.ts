import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";

/**
 * Teams / invite codes — MUST write to `access_codes` with hashed_code so that
 * `teams-auth` can validate (it only queries `access_codes`, not `team_access_codes`).
 */

function generateRandomCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const segments = [];
  for (let i = 0; i < 4; i++) {
    let segment = "";
    for (let j = 0; j < 4; j++) {
      segment += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    segments.push(segment);
  }
  return "FLOWIX-" + segments.join("-");
}

async function hashCode(code: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(code);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface GenerateCodeRequest {
  agent_token_id?: string;
  agent_id?: string;
  expires_in_days?: number;
  expires_in_minutes?: number;
  expires_at?: string;
  max_uses?: number;
  label?: string;
}

function resolveExpiresAt(body: GenerateCodeRequest): Date | null {
  if (body.expires_at) {
    const d = new Date(body.expires_at);
    if (!Number.isNaN(d.getTime())) return d;
    return null;
  }
  if (typeof body.expires_in_minutes === "number" && body.expires_in_minutes >= 1) {
    const d = new Date();
    d.setMinutes(d.getMinutes() + body.expires_in_minutes);
    return d;
  }
  if (typeof body.expires_in_days === "number" && body.expires_in_days >= 1) {
    const d = new Date();
    d.setDate(d.getDate() + body.expires_in_days);
    return d;
  }
  return null;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return corsPreflightResponse();
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let body: GenerateCodeRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const {
    agent_token_id,
    agent_id,
    max_uses = 100,
    label,
  } = body;

  if (!agent_token_id || typeof agent_token_id !== "string") {
    return jsonResponse({ error: "agent_token_id is required" }, 400);
  }

  if (!agent_id || typeof agent_id !== "string") {
    return jsonResponse({ error: "agent_id is required" }, 400);
  }

  const expiresAtDate = resolveExpiresAt(body);
  if (!expiresAtDate || expiresAtDate <= new Date()) {
    return jsonResponse({
      error: "Provide a future expires_at, expires_in_minutes, or expires_in_days",
    }, 400);
  }

  if (typeof max_uses !== "number" || max_uses < 1) {
    return jsonResponse({ error: "max_uses must be a positive number" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Missing Supabase credentials");
    return jsonResponse({ error: "Server configuration error" }, 500);
  }

  const authHeader = req.headers.get("Authorization");
  let authenticatedUserId: string | null = null;

  if (authHeader && authHeader.startsWith("Bearer ") && anonKey) {
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (!authError && user) {
      authenticatedUserId = user.id;
    }
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  try {
    const { data: agentToken, error: tokenError } = await supabase
      .from("agent_tokens")
      .select("id, user_id, agent_id")
      .eq("id", agent_token_id)
      .maybeSingle();

    if (tokenError) {
      console.error("Error looking up agent token:", tokenError);
      return jsonResponse({ error: "Failed to verify agent token" }, 500);
    }

    if (!agentToken) {
      return jsonResponse({ error: "Agent token not found" }, 404);
    }

    if (authenticatedUserId && agentToken.user_id && agentToken.user_id !== authenticatedUserId) {
      return jsonResponse({ error: "You do not own this agent token" }, 403);
    }

    if (agentToken.agent_id !== agent_id) {
      return jsonResponse({ error: "Agent ID mismatch" }, 400);
    }

    const { data: agentRow } = await supabase
      .from("agents")
      .select("teams_enabled, name")
      .eq("id", agent_id)
      .maybeSingle();

    if (agentRow && agentRow.teams_enabled === false) {
      return jsonResponse({
        error: "Teams sharing is disabled for this agent. Enable it in the dashboard first.",
      }, 403);
    }

    const rawCode = generateRandomCode();
    const hashedCode = await hashCode(rawCode);

    const metadata: Record<string, unknown> = {};
    if (label && typeof label === "string" && label.trim()) {
      metadata.label = label.trim().slice(0, 80);
    }
    if (agentRow?.name) metadata.agent_name = agentRow.name;

    const { data: accessCode, error: insertError } = await supabase
      .from("access_codes")
      .insert({
        hashed_code: hashedCode,
        agent_token_id: agent_token_id,
        agent_id: agent_id,
        is_active: true,
        expires_at: expiresAtDate.toISOString(),
        max_uses: max_uses,
        used_count: 0,
        metadata,
      })
      .select("id, created_at, expires_at")
      .single();

    if (insertError) {
      console.error("Error creating access code:", insertError);
      return jsonResponse({ error: "Failed to generate code" }, 500);
    }

    return jsonResponse({
      success: true,
      access_code_id: accessCode.id,
      code: rawCode,
      agent_id: agent_id,
      agent_token_id: agent_token_id,
      created_at: accessCode.created_at,
      expires_at: accessCode.expires_at,
      max_uses: max_uses,
      message: `Share this code with up to ${max_uses} teammates before it expires.`,
    }, 201);
  } catch (error) {
    console.error("Unexpected error:", error);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});

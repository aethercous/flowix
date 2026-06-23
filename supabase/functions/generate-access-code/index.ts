import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";

function generateRandomCode(): string {
  // Generate human-friendly code: WORLO-XXXX-XXXX-XXXX
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const segments = [];
  for (let i = 0; i < 4; i++) {
    let segment = "";
    for (let j = 0; j < 4; j++) {
      segment += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    segments.push(segment);
  }
  return "WORLO-" + segments.join("-");
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
  max_uses?: number;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return corsPreflightResponse();
  }

  // Only allow POST
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // Parse request body
  let body: GenerateCodeRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { agent_token_id, agent_id, expires_in_days = 7, max_uses = 1 } = body;

  // Validate inputs
  if (!agent_token_id || typeof agent_token_id !== "string") {
    return jsonResponse({ error: "agent_token_id is required" }, 400);
  }

  if (!agent_id || typeof agent_id !== "string") {
    return jsonResponse({ error: "agent_id is required" }, 400);
  }

  if (typeof expires_in_days !== "number" || expires_in_days < 1) {
    return jsonResponse(
      { error: "expires_in_days must be a positive number" },
      400
    );
  }

  if (typeof max_uses !== "number" || max_uses < 1) {
    return jsonResponse({ error: "max_uses must be a positive number" }, 400);
  }

  // Get Supabase credentials
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Missing Supabase credentials");
    return jsonResponse({ error: "Server configuration error" }, 500);
  }

  // ------------------------------------------------------------------
  // Authenticate: verify the caller's JWT
  // ------------------------------------------------------------------
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
    // Verify the agent token exists
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

    // Verify the caller owns this agent token (if authenticated)
    if (authenticatedUserId && agentToken.user_id && agentToken.user_id !== authenticatedUserId) {
      return jsonResponse({ error: "You do not own this agent token" }, 403);
    }

    // Verify the agent_id matches
    if (agentToken.agent_id !== agent_id) {
      return jsonResponse({ error: "Agent ID mismatch" }, 400);
    }

    // Generate a new access code
    const rawCode = generateRandomCode();
    const hashedCode = await hashCode(rawCode);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expires_in_days);

    // Insert the access code (hashed)
    const { data: accessCode, error: insertError } = await supabase
      .from("access_codes")
      .insert({
        hashed_code: hashedCode,
        agent_token_id: agent_token_id,
        agent_id: agent_id,
        is_active: true,
        expires_at: expiresAt.toISOString(),
        max_uses: max_uses,
        used_count: 0,
      })
      .select("id, created_at, expires_at")
      .single();

    if (insertError) {
      console.error("Error creating access code:", insertError);
      return jsonResponse({ error: "Failed to generate code" }, 500);
    }

    // Return success response with the RAW code (not hashed)
    // Only return the raw code once - user must save it
    return jsonResponse(
      {
        success: true,
        access_code_id: accessCode.id,
        code: rawCode, // Return raw code to user
        agent_id: agent_id,
        agent_token_id: agent_token_id,
        created_at: accessCode.created_at,
        expires_at: accessCode.expires_at,
        expires_in_days: expires_in_days,
        max_uses: max_uses,
        message: `Code will expire in ${expires_in_days} days. Keep this code safe - you won't be able to see it again!`,
      },
      201
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});

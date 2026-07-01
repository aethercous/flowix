import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";

async function hashCode(code: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(code);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Normalize user input so hashing matches generate-access-code values. */
function normalizeAccessCode(raw: string): string {
  let s = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (s.includes("_")) {
    s = s.replace(/_/g, "-");
  }
  // Legacy codes used FLOWIX-; new codes use WORLO-
  if (s.startsWith("FLOWIX-")) {
    s = "WORLO-" + s.slice(7);
  }
  return s;
}

/** Try WORLO- and legacy FLOWIX- hashes so older codes still work. */
async function lookupAccessCodeByInput(
  supabase: ReturnType<typeof createClient>,
  normalizedCode: string,
) {
  const candidates = [normalizedCode];
  if (normalizedCode.startsWith("WORLO-")) {
    candidates.push("FLOWIX-" + normalizedCode.slice(6));
  } else if (normalizedCode.startsWith("FLOWIX-")) {
    candidates.push("WORLO-" + normalizedCode.slice(7));
  }

  for (const candidate of candidates) {
    const hashedCode = await hashCode(candidate);
    const { data, error } = await supabase
      .from("access_codes")
      .select("id, agent_id, agent_token_id, is_active, expires_at, used_count, max_uses")
      .eq("hashed_code", hashedCode)
      .maybeSingle<AccessCode>();
    if (error) return { data: null, error };
    if (data) return { data, error: null };
  }
  return { data: null, error: null };
}

function getClientIpAddress(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers
      .get("x-forwarded-for")
      ?.split(",")[0]
      .trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

function getUserAgent(req: Request): string {
  return req.headers.get("user-agent") || "unknown";
}

interface LoginRequest {
  code: string;
  firstName: string;
  lastName: string;
  nickname?: string;
  memberToken?: string;
}

function displayName(firstName: string, lastName: string, nickname?: string | null): string {
  if (nickname?.trim()) return nickname.trim();
  return `${firstName} ${lastName}`.trim();
}

interface AccessCode {
  id: string;
  agent_id: string;
  agent_token_id: string;
  created_at: string;
  expires_at: string;
  is_active: boolean;
  used_count: number;
  max_uses: number;
}

interface AgentToken {
  id: string;
  user_id: string;
  agent_id: string;
  api_key: string;
  agent_config: {
    agentName?: string;
    systemPrompt?: string;
    model?: string;
    [key: string]: unknown;
  };
  llm_provider: string;
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
  let body: LoginRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { code, firstName, lastName, nickname, memberToken } = body;

  // Validate inputs
  if (!code || typeof code !== "string") {
    return jsonResponse({ error: "Invalid code" }, 400);
  }

  if (!firstName || typeof firstName !== "string" || firstName.length === 0) {
    return jsonResponse({ error: "Invalid first name" }, 400);
  }

  if (!lastName || typeof lastName !== "string" || lastName.length === 0) {
    return jsonResponse({ error: "Invalid last name" }, 400);
  }

  // Get Supabase clients
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Missing Supabase credentials");
    return jsonResponse({ error: "Server configuration error" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  try {
    const ipAddress = getClientIpAddress(req);
    const userAgent = getUserAgent(req);

    const normalizedCode = normalizeAccessCode(code);
    if (!normalizedCode || normalizedCode.length < 8) {
      return jsonResponse({ error: "Invalid code" }, 400);
    }

    // Look up the access code by hash (WORLO- and legacy FLOWIX- prefixes)
    const { data: accessCodeData, error: codeError } = await lookupAccessCodeByInput(
      supabase,
      normalizedCode,
    );

    if (codeError) {
      console.error("Database error looking up code:", codeError);
      // Log failed attempt
      await supabase.from("code_access_logs").insert({
        ip_address: ipAddress,
        user_agent: userAgent,
        first_name: firstName,
        last_name: lastName,
        success: false,
        error_reason: "Database error",
      });
      return jsonResponse({ error: "Authentication failed" }, 401);
    }

    // Log the attempt
    if (!accessCodeData) {
      console.warn("Code not found (invalid code)");
      await supabase.from("code_access_logs").insert({
        ip_address: ipAddress,
        user_agent: userAgent,
        first_name: firstName,
        last_name: lastName,
        success: false,
        error_reason: "Invalid code",
      });
      return jsonResponse({ error: "Invalid access code" }, 401);
    }

    // Check if code is active
    if (!accessCodeData.is_active) {
      console.warn("Code is inactive");
      await supabase.from("code_access_logs").insert({
        code_id: accessCodeData.id,
        ip_address: ipAddress,
        user_agent: userAgent,
        first_name: firstName,
        last_name: lastName,
        success: false,
        error_reason: "Code inactive",
      });
      return jsonResponse({ error: "Code is no longer active" }, 401);
    }

    // Check if code has expired
    const expiresAt = new Date(accessCodeData.expires_at);
    if (expiresAt < new Date()) {
      console.warn("Code has expired");
      await supabase.from("code_access_logs").insert({
        code_id: accessCodeData.id,
        ip_address: ipAddress,
        user_agent: userAgent,
        first_name: firstName,
        last_name: lastName,
        success: false,
        error_reason: "Code expired",
      });
      return jsonResponse({ error: "Code has expired" }, 401);
    }

    // Check if code has reached max uses
    if (accessCodeData.used_count >= accessCodeData.max_uses) {
      console.warn("Code has reached max uses");
      await supabase.from("code_access_logs").insert({
        code_id: accessCodeData.id,
        ip_address: ipAddress,
        user_agent: userAgent,
        first_name: firstName,
        last_name: lastName,
        success: false,
        error_reason: "Max uses reached",
      });
      return jsonResponse({ error: "Code has been used too many times" }, 401);
    }

    // Get the agent token details
    const { data: agentTokenData, error: tokenError } = await supabase
      .from("agent_tokens")
      .select(
        "id, user_id, agent_id, api_key, agent_config, llm_provider"
      )
      .eq("id", accessCodeData.agent_token_id)
      .maybeSingle<AgentToken>();

    if (tokenError) {
      console.error("Database error looking up token:", tokenError);
      return jsonResponse({ error: "Authentication failed" }, 500);
    }

    if (!agentTokenData) {
      console.error("Agent token not found:", accessCodeData.agent_token_id);
      return jsonResponse({ error: "Agent configuration not found" }, 404);
    }

    const { data: agentRow } = await supabase
      .from("agents")
      .select("teams_enabled, name")
      .eq("id", accessCodeData.agent_id)
      .maybeSingle();

    if (agentRow && agentRow.teams_enabled === false) {
      await supabase.from("code_access_logs").insert({
        code_id: accessCodeData.id,
        ip_address: ipAddress,
        user_agent: userAgent,
        first_name: firstName,
        last_name: lastName,
        success: false,
        error_reason: "Agent teams disabled",
      });
      return jsonResponse({
        error: "This agent is not accepting Teams connections right now",
      }, 403);
    }

    // Rejoin with existing member token (same device)
    if (memberToken && typeof memberToken === "string") {
      const { data: existingMember } = await supabase
        .from("team_members")
        .select("id, access_code_id, first_name, last_name, nickname, member_token, is_active")
        .eq("member_token", memberToken)
        .maybeSingle();

      if (existingMember) {
        if (!existingMember.is_active) {
          return jsonResponse({ error: "You have been removed from this team" }, 403);
        }
        if (existingMember.access_code_id !== accessCodeData.id) {
          return jsonResponse({ error: "Invite code does not match your session" }, 403);
        }

        await supabase
          .from("team_members")
          .update({
            first_name: firstName,
            last_name: lastName,
            nickname: nickname?.trim() || null,
            last_seen_at: new Date().toISOString(),
          })
          .eq("id", existingMember.id);

        const sessionExpiresAt = new Date();
        sessionExpiresAt.setHours(sessionExpiresAt.getHours() + 24);

        return jsonResponse({
          success: true,
          userId: agentTokenData.user_id,
          firstName,
          lastName,
          nickname: nickname?.trim() || existingMember.nickname || null,
          displayName: displayName(firstName, lastName, nickname || existingMember.nickname),
          email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@teams.worlo.local`,
          agentId: agentTokenData.agent_id,
          agentName:
            agentRow?.name ||
            agentTokenData.agent_config?.agentName ||
            "Your Agent",
          model: agentTokenData.agent_config?.model || agentTokenData.llm_provider,
          llmProvider: agentTokenData.llm_provider,
          accessToken: existingMember.id,
          agentKey: agentTokenData.api_key,
          memberId: existingMember.id,
          memberToken: existingMember.member_token,
          accessCodeId: accessCodeData.id,
          expiresAt: sessionExpiresAt.toISOString(),
        });
      }
    }

    // Increment code usage
    const { error: updateError } = await supabase
      .from("access_codes")
      .update({ used_count: accessCodeData.used_count + 1 })
      .eq("id", accessCodeData.id);

    if (updateError) {
      console.error("Failed to update code usage:", updateError);
    }

    // Generate a short-lived session token (valid for 24 hours)
    const sessionId = crypto.randomUUID();
    const sessionExpiresAt = new Date();
    sessionExpiresAt.setHours(sessionExpiresAt.getHours() + 24);

    // Log successful access
    const { error: logError } = await supabase
      .from("code_access_logs")
      .insert({
        code_id: accessCodeData.id,
        ip_address: ipAddress,
        user_agent: userAgent,
        first_name: firstName,
        last_name: lastName,
        success: true,
      });

    if (logError) {
      console.warn("Failed to log access:", logError);
      // Continue anyway - logging is optional
    }

    // Create team member for group chat
    const newMemberToken = crypto.randomUUID().replace(/-/g, "") +
      crypto.randomUUID().replace(/-/g, "");
    const { data: newMember, error: memberError } = await supabase
      .from("team_members")
      .insert({
        access_code_id: accessCodeData.id,
        first_name: firstName,
        last_name: lastName,
        nickname: nickname?.trim() || null,
        member_token: newMemberToken,
        last_seen_at: new Date().toISOString(),
      })
      .select("id, member_token")
      .single();

    if (memberError || !newMember) {
      console.error("Failed to create team member:", memberError);
      return jsonResponse({ error: "Could not join team" }, 500);
    }

    // Return success response
    return jsonResponse({
      success: true,
      userId: agentTokenData.user_id,
      firstName,
      lastName,
      nickname: nickname?.trim() || null,
      displayName: displayName(firstName, lastName, nickname),
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@teams.worlo.local`,
      agentId: agentTokenData.agent_id,
      agentName:
        agentRow?.name ||
        agentTokenData.agent_config?.agentName ||
        "Your Agent",
      model: agentTokenData.agent_config?.model || agentTokenData.llm_provider,
      llmProvider: agentTokenData.llm_provider,
      accessToken: sessionId,
      agentKey: agentTokenData.api_key,
      memberId: newMember.id,
      memberToken: newMember.member_token,
      accessCodeId: accessCodeData.id,
      expiresAt: sessionExpiresAt.toISOString(),
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});

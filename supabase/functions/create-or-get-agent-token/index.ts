import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseAllowedUrls } from "../_shared/url-allowlist.ts";
import {
  DEFAULT_OPENAI_PROMPT_ID,
  DEFAULT_OPENAI_PROMPT_VERSION,
} from "../_shared/openai-responses.ts";
import { normalizePermissions, permissionsPromptBlock } from "../_shared/agent-permissions.ts";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";

function generateApiKey(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let key = "nra_";
  for (let i = 0; i < 32; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

interface CreateOrGetAgentTokenRequest {
  agent_id: string;
  agent_name?: string;
  system_prompt?: string;
  model?: string;
  llm_provider?: string;
  llm_api_key?: string;
  allowed_urls?: string[] | string;
  can_read_navigate?: boolean;
  can_send_edit?: boolean;
  enableReasoning?: boolean;
  enableWebSearch?: boolean;
  use_worlo_backend_prompt?: boolean;
  sync_config?: boolean;
}

function inferLlmProvider(model: string | undefined, explicit: string | undefined): string {
  if (explicit && explicit.includes("/")) {
    return explicit;
  }
  const m = (model || "").toLowerCase();
  if (m === "openai-custom") return "openai/gpt-4o";
  if (m.includes("claude")) return `anthropic/${model}`;
  if (m.includes("gpt") || m.includes("o1") || m.includes("o3") || m.includes("o4")) {
    return `openai/${model}`;
  }
  if (m.includes("gemini")) return `google/${model}`;
  if (model) return `openai/${model}`;
  return "openai/gpt-4o";
}

function buildAgentConfig(body: CreateOrGetAgentTokenRequest): Record<string, unknown> {
  const agentConfig: Record<string, unknown> = {};
  if (body.agent_name) agentConfig.agentName = body.agent_name;

  const browserHint =
    " You have live web access via Browserbase tools during chat (start_browser, browse_url, get_page_content, etc.). Only visit URLs listed as connected sites.";
  const allowed = parseAllowedUrls(body.allowed_urls);
  if (allowed.length) {
    agentConfig.allowedUrls = allowed;
  }

  if (body.system_prompt) {
    let prompt = body.system_prompt.includes("Browserbase")
      ? body.system_prompt
      : body.system_prompt + browserHint;
    if (allowed.length) {
      prompt +=
        `\n\nAllowed websites only: ${allowed.join(", ")}. Do not open URLs outside this list.`;
    }
    agentConfig.systemPrompt = prompt;
  } else {
    agentConfig.systemPrompt = "You are a Worlo assistant." + browserHint;
  }

  if (body.model) agentConfig.model = body.model;

  const perms = normalizePermissions({
    can_read_navigate: body.can_read_navigate,
    can_send_edit: body.can_send_edit,
  });
  agentConfig.canReadNavigate = perms.can_read_navigate;
  agentConfig.canSendEdit = perms.can_send_edit;

  const base = (agentConfig.systemPrompt as string) || "";
  agentConfig.systemPrompt = base + permissionsPromptBlock(perms);

  if (body.enableReasoning !== undefined) agentConfig.enableReasoning = body.enableReasoning;
  if (body.enableWebSearch !== undefined) agentConfig.enableWebSearch = body.enableWebSearch;
  agentConfig.useWorloBackendPrompt = body.use_worlo_backend_prompt !== false;

  agentConfig.openaiPromptId =
    Deno.env.get("OPENAI_BACKEND_PROMPT_ID") || DEFAULT_OPENAI_PROMPT_ID;
  agentConfig.openaiPromptVersion =
    Deno.env.get("OPENAI_BACKEND_PROMPT_VERSION") || DEFAULT_OPENAI_PROMPT_VERSION;
  if (body.enableWebSearch === undefined) agentConfig.enableWebSearch = true;
  if (body.enableReasoning === undefined) agentConfig.enableReasoning = true;

  return agentConfig;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return corsPreflightResponse();
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let body: CreateOrGetAgentTokenRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { agent_id, llm_provider, llm_api_key, sync_config } = body;

  if (!agent_id || typeof agent_id !== "string") {
    return jsonResponse({ error: "agent_id is required" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    console.error("Missing Supabase credentials");
    return jsonResponse({ error: "Server configuration error" }, 500);
  }

  const authHeader = req.headers.get("Authorization");
  let authenticatedUserId: string | null = null;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (!authError && user) {
      authenticatedUserId = user.id;
    }
  }

  if (!authenticatedUserId) {
    return jsonResponse({ error: "Authentication required" }, 401);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  const { data: agentRow, error: agentError } = await supabase
    .from("agents")
    .select("id, user_id, name, model, system_prompt, allowed_urls, can_read_navigate, can_send_edit, use_worlo_backend_prompt")
    .eq("id", agent_id)
    .eq("user_id", authenticatedUserId)
    .maybeSingle();

  if (agentError) {
    console.error("Agent lookup error:", agentError);
    return jsonResponse({ error: "Failed to verify agent" }, 500);
  }

  if (!agentRow) {
    return jsonResponse({ error: "Agent not found or access denied" }, 404);
  }

  try {
    const { data: existingToken, error: selectError } = await supabase
      .from("agent_tokens")
      .select("id, api_key, llm_provider, agent_config, llm_key_encrypted")
      .eq("agent_id", agent_id)
      .eq("user_id", authenticatedUserId)
      .maybeSingle();

    if (selectError) {
      console.error("Error checking for existing agent token:", selectError);
      return jsonResponse({ error: "Failed to check agent token" }, 500);
    }

    const agentConfig = buildAgentConfig({
      ...body,
      agent_name: body.agent_name ?? agentRow.name,
      system_prompt: body.system_prompt ?? agentRow.system_prompt,
      model: body.model ?? agentRow.model,
      allowed_urls: body.allowed_urls ?? agentRow.allowed_urls,
      can_read_navigate: body.can_read_navigate ?? agentRow.can_read_navigate,
      can_send_edit: body.can_send_edit ?? agentRow.can_send_edit,
      use_worlo_backend_prompt: body.use_worlo_backend_prompt ??
        agentRow.use_worlo_backend_prompt,
    });

    const resolvedLlmProvider = inferLlmProvider(
      (body.model ?? agentRow.model) as string,
      llm_provider,
    );

    if (!resolvedLlmProvider.includes("/")) {
      return jsonResponse({ error: "Invalid llm_provider format (expected provider/model)" }, 400);
    }

    if (existingToken) {
      if (sync_config || body.agent_name || body.system_prompt || body.model || body.allowed_urls) {
        const updates: Record<string, unknown> = {
          agent_config: agentConfig,
          llm_provider: resolvedLlmProvider,
        };
        if (llm_api_key && typeof llm_api_key === "string" && llm_api_key.trim()) {
          updates.llm_key_encrypted = llm_api_key.trim();
        }

        const { error: updateError } = await supabase
          .from("agent_tokens")
          .update(updates)
          .eq("id", existingToken.id);

        if (updateError) {
          console.error("Token update error:", updateError);
          return jsonResponse({ error: "Failed to update agent token" }, 500);
        }
      } else if (existingToken.llm_provider && !String(existingToken.llm_provider).includes("/")) {
        const cfg = existingToken.agent_config as { model?: string } | null;
        const fixed = inferLlmProvider(cfg?.model, existingToken.llm_provider);
        await supabase.from("agent_tokens").update({ llm_provider: fixed }).eq("id", existingToken.id);
      }

      return jsonResponse({
        success: true,
        token_id: existingToken.id,
        api_key: existingToken.api_key,
        message: "Existing agent token returned",
      });
    }

    const apiKey = generateApiKey();
    const { data: newToken, error: insertError } = await supabase
      .from("agent_tokens")
      .insert({
        user_id: authenticatedUserId,
        agent_id: agent_id,
        api_key: apiKey,
        agent_config: agentConfig,
        llm_provider: resolvedLlmProvider,
        llm_key_encrypted: (llm_api_key && llm_api_key.trim()) ? llm_api_key.trim() : "",
      })
      .select("id, api_key")
      .single();

    if (insertError) {
      console.error("Error creating agent token:", insertError);
      return jsonResponse({ error: "Failed to create agent token" }, 500);
    }

    return jsonResponse({
      success: true,
      token_id: newToken.id,
      api_key: newToken.api_key,
      message: "New agent token created",
    }, 201);
  } catch (error) {
    console.error("Unexpected error:", error);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});

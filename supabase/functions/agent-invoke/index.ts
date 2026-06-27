import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";

import { webAccessSystemPromptBlock } from "../_shared/agent-tools.ts";
import { googleWorkspaceToolsEnabled } from "../_shared/google-workspace-tools.ts";

import {
  type AgentIdentity,
  buildBrowserRuntimeContext,
  describeConnectionsForPrompt,
} from "../_shared/browser-runtime.ts";

import { parseAllowedUrls } from "../_shared/url-allowlist.ts";

import { normalizePermissions, permissionsPromptBlock } from "../_shared/agent-permissions.ts";

import {

  type HistoryMessage,

  runAgentWithOptionalTools,

} from "../_shared/llm-agent-loop.ts";

import { resolveApiModel } from "../_shared/model-map.ts";



// ---------------------------------------------------------------------------

// Types

// ---------------------------------------------------------------------------



interface AgentTokenRow {

  id: string;

  user_id: string;

  agent_id: string;

  api_key: string;

  agent_config: {

    systemPrompt?: string;

    model?: string;

    agentName?: string;

    allowedUrls?: string[];

    canReadNavigate?: boolean;

    canSendEdit?: boolean;

    [key: string]: unknown;

  };

  llm_provider: string;

  llm_key_encrypted: string;

  created_at: string;

}



// ---------------------------------------------------------------------------

// LLM provider normalization

// ---------------------------------------------------------------------------



function inferLlmProvider(model: string | undefined, explicit: string | undefined): string {

  if (explicit && explicit.includes("/")) return explicit;

  const m = (model || explicit || "").toLowerCase();

  if (m.includes("claude") || m.includes("opus") || m.includes("sonnet")) {
    const id = m.includes("opus")
      ? "claude-3-opus-20240229"
      : "claude-3-5-sonnet-20241022";
    return `anthropic/${model && model.startsWith("claude-3") ? model : id}`;
  }

  if (m.includes("gpt") || m.includes("o1") || m.includes("o3") || m.includes("o4")) {
    const openaiModel = m === "gpt-4" ? "gpt-4o" : (model || "gpt-4o");
    return `openai/${openaiModel}`;
  }

  if (m.includes("gemini")) return `google/${model || "gemini-1.5-pro"}`;

  if (explicit === "openai" || m.includes("openai")) return `openai/${model || "gpt-4o"}`;

  if (explicit === "anthropic" || m.includes("anthropic")) {

    return `anthropic/${model || "claude-3-5-sonnet-20241022"}`;

  }

  if (model) return `openai/${model}`;

  return "openai/gpt-4o";

}



function normalizeLlmProvider(

  raw: string | undefined,

  modelFromConfig: string | undefined,

): { provider: string; prefix: string; model: string } {

  const provider = inferLlmProvider(modelFromConfig, raw);

  const slash = provider.indexOf("/");

  if (slash === -1) {

    return { provider: "openai/gpt-4o", prefix: "openai", model: modelFromConfig || "gpt-4o" };

  }

  const prefix = provider.slice(0, slash).toLowerCase();

  const model = modelFromConfig || provider.slice(slash + 1);

  return { provider, prefix, model };

}



/** Drop duplicate trailing user turn when clients send history + message separately. */

function dedupeHistory(history: HistoryMessage[], message: string): HistoryMessage[] {

  if (!history.length) return history;

  const last = history[history.length - 1];

  if (last.role === "user" && last.content.trim() === message.trim()) {

    return history.slice(0, -1);

  }

  return history;

}



function buildSystemPrompt(

  baseFromToken: string,

  agentRow: {

    system_prompt?: string | null;

    allowed_urls?: unknown;

    unrestricted_browsing?: boolean;

    can_read_navigate?: boolean;

    can_send_edit?: boolean;

  } | null,

  agentConfig: AgentTokenRow["agent_config"],

): string {

  let basePrompt = agentRow?.system_prompt?.trim() || baseFromToken || "You are a helpful Worlo assistant.";



  const allowedUrls = parseAllowedUrls(agentRow?.allowed_urls ?? agentConfig?.allowedUrls);
  const unrestrictedBrowsing = typeof agentRow?.unrestricted_browsing === "boolean"
    ? agentRow.unrestricted_browsing
    : !!agentConfig?.unrestrictedBrowsing;

  const perms = normalizePermissions({

    can_read_navigate: agentRow?.can_read_navigate ?? agentConfig?.canReadNavigate,

    can_send_edit: agentRow?.can_send_edit ?? agentConfig?.canSendEdit,

  });



  const browserCtx = buildBrowserRuntimeContext({

    allowed_urls: allowedUrls,
    unrestricted_browsing: unrestrictedBrowsing,

    can_read_navigate: perms.can_read_navigate,

    can_send_edit: perms.can_send_edit,

  });



  basePrompt += webAccessSystemPromptBlock(browserCtx);

  basePrompt += permissionsPromptBlock(perms);



  return basePrompt;

}



// ---------------------------------------------------------------------------

// Main handler

// ---------------------------------------------------------------------------



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



  let message: string;

  let history: HistoryMessage[] = [];



  try {

    const body = await req.json();

    message = body.message;

    history = Array.isArray(body.history) ? body.history : [];



    if (!message || typeof message !== "string") {

      return jsonResponse({ error: "message is required and must be a string" }, 400);

    }

  } catch {

    return jsonResponse({ error: "Invalid JSON body" }, 400);

  }



  history = dedupeHistory(history, message);



  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;



  const supabase = createClient(supabaseUrl, serviceRoleKey, {

    auth: { persistSession: false },

  });



  const { data: tokenRow, error: dbError } = await supabase

    .from("agent_tokens")

    .select(

      "id, user_id, agent_id, api_key, agent_config, llm_provider, llm_key_encrypted, created_at",

    )

    .eq("api_key", agentKey)

    .maybeSingle<AgentTokenRow>();



  if (dbError) {

    console.error("DB error looking up agent token:", dbError);

    return jsonResponse({ error: "Internal server error" }, 500);

  }



  if (!tokenRow) {

    return jsonResponse({ error: "Unauthorized" }, 401);

  }



  const { agent_config, llm_provider, llm_key_encrypted } = tokenRow;



  const { data: agentRow } = await supabase

    .from("agents")

    .select("id, system_prompt, allowed_urls, unrestricted_browsing, can_read_navigate, can_send_edit, use_worlo_backend_prompt, name, model")

    .eq("id", tokenRow.agent_id)

    .maybeSingle();



  const agentName = agentRow?.name ?? (agent_config?.agentName as string) ?? "Agent";
  const useBackendPrompt = typeof agentRow?.use_worlo_backend_prompt === "boolean"
    ? agentRow.use_worlo_backend_prompt
    : agent_config?.useWorloBackendPrompt !== false;
  const systemPrompt = buildSystemPrompt(

    (agent_config?.systemPrompt as string) ?? "",

    agentRow,

    agent_config,

  );



  const identity: AgentIdentity = {
    userId: tokenRow.user_id,
    agentId: tokenRow.agent_id,
    supabase,
  };

  const browserCtx = buildBrowserRuntimeContext(
    agentRow ?? {
      allowed_urls: agent_config?.allowedUrls,
      can_read_navigate: agent_config?.canReadNavigate,
      can_send_edit: agent_config?.canSendEdit,
    },
    identity,
  );

  const connectionsBlock = await describeConnectionsForPrompt(browserCtx);



  const { provider: normalizedProvider, prefix: providerPrefix, model: rawModel } =
    normalizeLlmProvider(
      llm_provider,
      (agentRow?.model ?? agent_config?.model) as string | undefined,
    );

  const model = resolveApiModel(providerPrefix, rawModel);



  if (llm_provider !== normalizedProvider) {

    await supabase

      .from("agent_tokens")

      .update({ llm_provider: normalizedProvider })

      .eq("id", tokenRow.id);

  }



  let llmApiKey = llm_key_encrypted;



  if (!llmApiKey) {

    if (providerPrefix === "anthropic") {

      llmApiKey = Deno.env.get("CLAUDE_APIKEY") || "";

    } else if (providerPrefix === "openai") {

      llmApiKey = Deno.env.get("OPENAI_APIKEY") || "";

    } else if (providerPrefix === "google") {

      llmApiKey = Deno.env.get("GEMINI_APIKEY") || "";

    }

  }



  if (!llmApiKey) {

    return jsonResponse({ error: `Missing API key for provider: ${providerPrefix}` }, 500);

  }



  let reply: string;



  try {

    reply = await runAgentWithOptionalTools({
      providerPrefix,
      model,
      apiKey: llmApiKey,
      systemPrompt: systemPrompt + connectionsBlock,
      history,
      message,
      browserCtx,
      openaiPromptId: agent_config?.openaiPromptId as string | undefined,
      openaiPromptVersion: agent_config?.openaiPromptVersion as string | undefined,
      enableReasoning: agent_config?.enableReasoning !== false,
      enableWebSearch: agent_config?.enableWebSearch !== false,
      useBackendPrompt,
      agentName,
    });

  } catch (err) {

    console.error("LLM call failed:", err);

    const detail = err instanceof Error ? err.message : String(err);

    return jsonResponse({ error: "LLM provider error", detail }, 500);

  }



  return jsonResponse({

    reply,

    model,

    agentName,

    webEnabled: browserCtx.perms.can_read_navigate && browserCtx.allowedUrls.length > 0,

    googleWorkspaceEnabled: await googleWorkspaceToolsEnabled(browserCtx),

    allowedSites: browserCtx.allowedUrls,

  });

});


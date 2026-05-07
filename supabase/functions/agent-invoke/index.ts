import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HistoryMessage {
  role: string;
  content: string;
}

interface AgentTokenRow {
  id: string;
  user_id: string;
  agent_id: string;
  api_key: string;
  agent_config: {
    systemPrompt?: string;
    model?: string;
    agentName?: string;
    [key: string]: unknown;
  };
  llm_provider: string; // e.g. "anthropic/claude-3-5-sonnet", "openai/gpt-4o", "google/gemini-1.5-pro"
  // NOTE: In production this field should be encrypted using Supabase Vault
  // (https://supabase.com/docs/guides/database/vault) and decrypted server-side.
  // For now it is stored and read as plain text.
  llm_key_encrypted: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// CORS helpers
// ---------------------------------------------------------------------------

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  // Expose X-Agent-Key so browser clients can send it
  "Access-Control-Allow-Headers": "Content-Type, X-Agent-Key",
};

function corsPreflightResponse(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// LLM routing helpers
// ---------------------------------------------------------------------------

/** Anthropic Messages API */
async function callAnthropic(
  apiKey: string,
  model: string,
  systemPrompt: string,
  history: HistoryMessage[],
  message: string,
): Promise<string> {
  // Build the messages array: history + current user message
  const messages = [
    ...history.map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: message },
  ];

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  // Response shape: { content: [{ type: "text", text: "..." }], ... }
  const textBlock = data.content?.find((b: { type: string }) => b.type === "text");
  if (!textBlock) throw new Error("No text content in Anthropic response");
  return (textBlock as { type: string; text: string }).text;
}

/** OpenAI Chat Completions API */
async function callOpenAI(
  apiKey: string,
  model: string,
  systemPrompt: string,
  history: HistoryMessage[],
  message: string,
): Promise<string> {
  const messages = [
    { role: "system", content: systemPrompt },
    ...history.map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: message },
  ];

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const reply = data.choices?.[0]?.message?.content;
  if (typeof reply !== "string") throw new Error("Unexpected OpenAI response shape");
  return reply;
}

/** Google Generative Language API (Gemini) */
async function callGoogle(
  apiKey: string,
  model: string,
  systemPrompt: string,
  history: HistoryMessage[],
  message: string,
): Promise<string> {
  // Map history to Google's `contents` format, then append the current message
  const contents = [
    ...history.map((h) => ({
      role: h.role === "assistant" ? "model" : "user",
      parts: [{ text: h.content }],
    })),
    { role: "user", parts: [{ text: message }] },
  ];

  // model is expected to be just the model ID portion, e.g. "gemini-1.5-pro"
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google AI API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") throw new Error("Unexpected Google AI response shape");
  return text;
}

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
  // Extract and validate X-Agent-Key
  // ------------------------------------------------------------------
  const agentKey = req.headers.get("X-Agent-Key");
  if (!agentKey || !agentKey.startsWith("nra_")) {
    return jsonResponse({ error: "Missing or invalid X-Agent-Key header" }, 401);
  }

  // ------------------------------------------------------------------
  // Parse request body
  // ------------------------------------------------------------------
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

  // ------------------------------------------------------------------
  // Look up the agent token using the service-role key (bypasses RLS)
  // ------------------------------------------------------------------
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

  // ------------------------------------------------------------------
  // Resolve config from the token row
  // ------------------------------------------------------------------
  const { agent_config, llm_provider, llm_key_encrypted } = tokenRow;

  const systemPrompt = agent_config?.systemPrompt ?? "You are a helpful assistant.";
  const agentName = agent_config?.agentName ?? "Agent";

  // llm_provider format: "<provider-prefix>/<model-id>"
  // e.g. "anthropic/claude-3-5-sonnet-20241022", "openai/gpt-4o", "google/gemini-1.5-pro"
  const providerSlashIndex = llm_provider.indexOf("/");
  if (providerSlashIndex === -1) {
    return jsonResponse({ error: "Invalid llm_provider format in agent config" }, 500);
  }

  const providerPrefix = llm_provider.slice(0, providerSlashIndex).toLowerCase();
  // Use the model from agent_config if present, otherwise fall back to the part after "/"
  const model = agent_config?.model ?? llm_provider.slice(providerSlashIndex + 1);

  // NOTE: llm_key_encrypted is currently stored as plain text.
  // In production, decrypt this using Supabase Vault before use.
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

  // ------------------------------------------------------------------
  // Route to the appropriate LLM provider
  // ------------------------------------------------------------------
  let reply: string;

  try {
    if (providerPrefix === "anthropic") {
      reply = await callAnthropic(llmApiKey, model, systemPrompt, history, message);
    } else if (providerPrefix === "openai") {
      reply = await callOpenAI(llmApiKey, model, systemPrompt, history, message);
    } else if (providerPrefix === "google") {
      reply = await callGoogle(llmApiKey, model, systemPrompt, history, message);
    } else {
      return jsonResponse(
        { error: `Unsupported LLM provider: ${providerPrefix}` },
        400,
      );
    }
  } catch (err) {
    console.error("LLM call failed:", err);
    const detail = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: "LLM provider error", detail }, 500);
  }

  // ------------------------------------------------------------------
  // Return the response
  // ------------------------------------------------------------------
  return jsonResponse({ reply, model, agentName });
});

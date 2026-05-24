import {
  type AgentToolState,
  buildWebToolDefinitions,
  executeAgentTool,
  type ToolDefinition,
  webToolsEnabled,
} from "./agent-tools.ts";
import type { BrowserRuntimeContext } from "./browser-runtime.ts";
import { runOpenAiResponses } from "./openai-responses.ts";
import { resolveApiModel, shouldUseOpenAiResponses } from "./model-map.ts";

export interface HistoryMessage {
  role: string;
  content: string;
}

const MAX_TOOL_ROUNDS = 8;

export interface RunAgentOptions {
  providerPrefix: string;
  model: string;
  apiKey: string;
  systemPrompt: string;
  history: HistoryMessage[];
  message: string;
  browserCtx: BrowserRuntimeContext;
  openaiPromptId?: string;
  openaiPromptVersion?: string;
  enableReasoning?: boolean;
  enableWebSearch?: boolean;
  agentName?: string;
}

// ---------------------------------------------------------------------------
// OpenAI tool loop
// ---------------------------------------------------------------------------

function toOpenAiTools(tools: ToolDefinition[]) {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

async function runOpenAiWithTools(
  opts: RunAgentOptions,
  tools: ToolDefinition[],
  state: AgentToolState,
): Promise<string> {
  const messages: Record<string, unknown>[] = [
    { role: "system", content: opts.systemPrompt },
    ...opts.history.map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: opts.message },
  ];

  const openAiTools = toOpenAiTools(tools);

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const body: Record<string, unknown> = {
      model: opts.model,
      messages,
    };
    if (openAiTools.length) body.tools = openAiTools;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`OpenAI API error ${res.status}: ${await res.text()}`);
    }

    const data = await res.json();
    const choice = data.choices?.[0];
    const assistantMsg = choice?.message;
    if (!assistantMsg) throw new Error("Unexpected OpenAI response shape");

    const toolCalls = assistantMsg.tool_calls as
      | Array<{ id: string; function: { name: string; arguments: string } }>
      | undefined;

    if (!toolCalls?.length) {
      const content = assistantMsg.content;
      if (typeof content !== "string") throw new Error("No text in OpenAI response");
      return content;
    }

    messages.push(assistantMsg);

    for (const tc of toolCalls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.function.arguments || "{}");
      } catch {
        args = {};
      }
      const result = await executeAgentTool(tc.function.name, args, opts.browserCtx, state);
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify(result),
      });
    }
  }

  throw new Error("Tool loop exceeded maximum rounds");
}

// ---------------------------------------------------------------------------
// Anthropic tool loop
// ---------------------------------------------------------------------------

function toAnthropicTools(tools: ToolDefinition[]) {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));
}

async function runAnthropicWithTools(
  opts: RunAgentOptions,
  tools: ToolDefinition[],
  state: AgentToolState,
): Promise<string> {
  const messages: Record<string, unknown>[] = [
    ...opts.history.map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: opts.message },
  ];

  const anthropicTools = toAnthropicTools(tools);

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const body: Record<string, unknown> = {
      model: opts.model,
      max_tokens: 4096,
      system: opts.systemPrompt,
      messages,
    };
    if (anthropicTools.length) body.tools = anthropicTools;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": opts.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
    }

    const data = await res.json();
    const content = data.content as Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>;
    const stopReason = data.stop_reason as string;

    const textParts = content.filter((b) => b.type === "text").map((b) => b.text || "").join("");
    const toolUses = content.filter((b) => b.type === "tool_use");

    if (stopReason !== "tool_use" || !toolUses.length) {
      if (!textParts) throw new Error("No text content in Anthropic response");
      return textParts;
    }

    messages.push({ role: "assistant", content });

    const toolResults: Array<{ type: string; tool_use_id: string; content: string }> = [];
    for (const tu of toolUses) {
      const result = await executeAgentTool(
        tu.name!,
        (tu.input || {}) as Record<string, unknown>,
        opts.browserCtx,
        state,
      );
      toolResults.push({
        type: "tool_result",
        tool_use_id: tu.id!,
        content: JSON.stringify(result),
      });
    }

    messages.push({ role: "user", content: toolResults });
  }

  throw new Error("Tool loop exceeded maximum rounds");
}

// ---------------------------------------------------------------------------
// Google Gemini tool loop
// ---------------------------------------------------------------------------

function toGeminiTools(tools: ToolDefinition[]) {
  return [{
    functionDeclarations: tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    })),
  }];
}

async function runGoogleWithTools(
  opts: RunAgentOptions,
  tools: ToolDefinition[],
  state: AgentToolState,
): Promise<string> {
  const contents: Record<string, unknown>[] = [
    ...opts.history.map((h) => ({
      role: h.role === "assistant" ? "model" : "user",
      parts: [{ text: h.content }],
    })),
    { role: "user", parts: [{ text: opts.message }] },
  ];

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${opts.model}:generateContent?key=${opts.apiKey}`;

  const geminiTools = tools.length ? toGeminiTools(tools) : undefined;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const body: Record<string, unknown> = {
      systemInstruction: { parts: [{ text: opts.systemPrompt }] },
      contents,
    };
    if (geminiTools) body.tools = geminiTools;

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`Google AI API error ${res.status}: ${await res.text()}`);
    }

    const data = await res.json();
    const candidate = data.candidates?.[0];
    const parts = candidate?.content?.parts as Array<Record<string, unknown>> | undefined;
    if (!parts?.length) throw new Error("Unexpected Google AI response shape");

    const functionCalls = parts.filter((p) => p.functionCall);
    const textParts = parts.filter((p) => typeof p.text === "string").map((p) => p.text as string);

    if (!functionCalls.length) {
      const text = textParts.join("");
      if (!text) throw new Error("No text in Google AI response");
      return text;
    }

    contents.push({ role: "model", parts });

    const responseParts: Record<string, unknown>[] = [];
    for (const fcPart of functionCalls) {
      const fc = fcPart.functionCall as { name: string; args?: Record<string, unknown> };
      const result = await executeAgentTool(
        fc.name,
        fc.args || {},
        opts.browserCtx,
        state,
      );
      responseParts.push({
        functionResponse: {
          name: fc.name,
          response: { result },
        },
      });
    }

    contents.push({ role: "user", parts: responseParts });
  }

  throw new Error("Tool loop exceeded maximum rounds");
}

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

export async function runAgentWithOptionalTools(opts: RunAgentOptions): Promise<string> {
  const state: AgentToolState = { browserSessionId: null };
  const toolsEnabled = webToolsEnabled(opts.browserCtx);
  const tools = toolsEnabled ? buildWebToolDefinitions(opts.browserCtx) : [];
  const apiModel = resolveApiModel(opts.providerPrefix, opts.model);
  const runOpts = { ...opts, model: apiModel };

  if (opts.providerPrefix === "openai") {
    if (shouldUseOpenAiResponses(apiModel)) {
      try {
        return await runOpenAiResponses({
          apiKey: opts.apiKey,
          model: apiModel,
          systemPrompt: opts.systemPrompt,
          history: opts.history,
          message: opts.message,
          browserCtx: opts.browserCtx,
          promptId: opts.openaiPromptId,
          promptVersion: opts.openaiPromptVersion,
          enableReasoning: opts.enableReasoning,
          enableWebSearch: opts.enableWebSearch,
          promptVariables: {
            agent_name: opts.agentName || "Flowix Agent",
          },
        });
      } catch (responsesErr) {
        console.warn("OpenAI Responses failed, falling back to Chat Completions:", responsesErr);
      }
    }
    return runOpenAiWithTools(runOpts, tools, state);
  }
  if (opts.providerPrefix === "anthropic") {
    return runAnthropicWithTools(runOpts, tools, state);
  }
  if (opts.providerPrefix === "google") {
    return runGoogleWithTools(runOpts, tools, state);
  }

  throw new Error(`Unsupported provider: ${opts.providerPrefix}`);
}

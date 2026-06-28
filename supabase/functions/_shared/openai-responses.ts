import {
  type AgentToolState,
  buildAllToolDefinitions,
  executeAgentTool,
  type ToolDefinition,
} from "./agent-tools.ts";
import type { BrowserRuntimeContext } from "./browser-runtime.ts";
import { modelSupportsReasoning } from "./model-map.ts";
import { normalizeAllowedUrlEntry } from "./url-allowlist.ts";
import { resolveOpenAiInstructions } from "./worlo-openai-backend-prompt.ts";

interface HistoryMessage {
  role: string;
  content: string;
}

const RESPONSES_URL = "https://api.openai.com/v1/responses";
const MAX_ROUNDS = 8;

export const DEFAULT_OPENAI_PROMPT_ID =
  "pmpt_6a0100206c9881909670fced10f3650201b495c850b9ec44";
export const DEFAULT_OPENAI_PROMPT_VERSION = "2";

export interface OpenAiResponsesOptions {
  apiKey: string;
  model: string;
  systemPrompt: string;
  history: HistoryMessage[];
  message: string;
  browserCtx: BrowserRuntimeContext;
  promptId?: string;
  promptVersion?: string;
  promptVariables?: Record<string, string>;
  enableReasoning?: boolean;
  enableWebSearch?: boolean;
  useBackendPrompt?: boolean;
  previousResponseId?: string | null;
}

type RequestMode = "full" | "no_prompt" | "minimal";

function toResponsesInput(
  history: HistoryMessage[],
  message: string,
): Array<Record<string, unknown>> {
  const items: Array<Record<string, unknown>> = [];
  for (const h of history) {
    items.push({
      role: h.role === "assistant" ? "assistant" : "user",
      content: h.content,
    });
  }
  items.push({ role: "user", content: message });
  return items;
}

function toAllowedDomains(allowedUrls: string[]): string[] {
  return [...new Set(allowedUrls.map((u) => normalizeAllowedUrlEntry(u)).filter(Boolean))];
}

function toResponsesFunctionTools(tools: ToolDefinition[]): Record<string, unknown>[] {
  return tools.map((t) => ({
    type: "function",
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));
}

function extractTextFromResponse(data: Record<string, unknown>): string {
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text;
  }

  const output = data.output as Array<Record<string, unknown>> | undefined;
  if (!output?.length) return "";

  const parts: string[] = [];
  for (const item of output) {
    if (item.type === "message") {
      const content = item.content as Array<{ type?: string; text?: string }> | undefined;
      if (content) {
        for (const block of content) {
          if (block.type === "output_text" || block.type === "text") {
            if (block.text) parts.push(block.text);
          }
        }
      }
    }
  }
  return parts.join("\n").trim();
}

function extractFunctionCalls(
  data: Record<string, unknown>,
): Array<{ call_id: string; name: string; arguments: string }> {
  const output = data.output as Array<Record<string, unknown>> | undefined;
  if (!output) return [];

  const calls: Array<{ call_id: string; name: string; arguments: string }> = [];
  for (const item of output) {
    if (item.type === "function_call") {
      calls.push({
        call_id: String(item.call_id || item.id || ""),
        name: String(item.name || ""),
        arguments: typeof item.arguments === "string"
          ? item.arguments
          : JSON.stringify(item.arguments ?? {}),
      });
    }
  }
  return calls.filter((c) => c.call_id && c.name);
}

function buildRequestBody(
  opts: OpenAiResponsesOptions,
  mode: RequestMode,
  input: unknown,
  tools: Record<string, unknown>[],
  previousResponseId?: string,
): Record<string, unknown> {
  const instructions = resolveOpenAiInstructions(opts.systemPrompt, {
    agentInstructions: opts.systemPrompt,
    allowedSites: opts.browserCtx.allowedUrls,
    agentName: opts.promptVariables?.agent_name,
    useBackendPrompt: opts.useBackendPrompt,
  });

  const body: Record<string, unknown> = {
    model: opts.model,
    input,
    instructions,
  };

  if (mode !== "minimal") {
    body.store = true;
    if (tools.length) body.tools = tools;
  }

  const useReasoning = opts.enableReasoning !== false && modelSupportsReasoning(opts.model);
  if (useReasoning && mode !== "minimal") {
    body.reasoning = { summary: "auto" };
    body.include = [
      "reasoning.encrypted_content",
      "web_search_call.action.sources",
    ];
  }

  if (mode === "full") {
    const promptId = opts.promptId || Deno.env.get("OPENAI_BACKEND_PROMPT_ID");
    const useHosted = opts.useBackendPrompt !== false &&
      Deno.env.get("OPENAI_USE_HOSTED_PROMPT") === "true" && !!promptId;
    if (useHosted) {
      const promptVersion = opts.promptVersion ||
        Deno.env.get("OPENAI_BACKEND_PROMPT_VERSION") ||
        DEFAULT_OPENAI_PROMPT_VERSION;
      body.prompt = {
        id: promptId,
        version: promptVersion,
        variables: {
          agent_instructions: opts.systemPrompt,
          allowed_sites: opts.browserCtx.allowedUrls.join(", "),
          ...(opts.promptVariables || {}),
        },
      };
    }
  }

  if (previousResponseId) body.previous_response_id = previousResponseId;

  return body;
}

async function callResponsesApi(
  apiKey: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; data?: Record<string, unknown>; errorText?: string }> {
  const res = await fetch(RESPONSES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    return { ok: false, status: res.status, errorText: await res.text() };
  }

  return { ok: true, status: res.status, data: await res.json() as Record<string, unknown> };
}

export async function runOpenAiResponses(opts: OpenAiResponsesOptions): Promise<string> {
  const state: AgentToolState = { browserSessionId: null };
  const browserTools = await buildAllToolDefinitions(opts.browserCtx);

  const useWebSearch = opts.enableWebSearch !== false &&
    opts.browserCtx.perms.can_read_navigate &&
    opts.browserCtx.allowedUrls.length > 0;

  const tools: Record<string, unknown>[] = [...toResponsesFunctionTools(browserTools)];

  if (useWebSearch) {
    const domains = toAllowedDomains(opts.browserCtx.allowedUrls);
    tools.push({
      type: "web_search",
      ...(domains.length ? { filters: { allowed_domains: domains } } : {}),
    });
  }

  let input: unknown = toResponsesInput(opts.history, opts.message);
  let previousResponseId = opts.previousResponseId ?? undefined;

  const modes: RequestMode[] = ["full", "no_prompt", "minimal"];
  let modeIndex = 0;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const mode = modes[Math.min(modeIndex, modes.length - 1)];
    const body = buildRequestBody(opts, mode, input, tools, previousResponseId);

    const result = await callResponsesApi(opts.apiKey, body);

    if (!result.ok) {
      const errText = result.errorText || "";
      const isPromptError = /prompt|pmpt_|not found|invalid/i.test(errText);
      const isReasoningError = /reasoning|include/i.test(errText);

      if (modeIndex < modes.length - 1 && (isPromptError || isReasoningError || result.status === 400)) {
        modeIndex++;
        continue;
      }
      throw new Error(`OpenAI Responses API error ${result.status}: ${errText}`);
    }

    const data = result.data!;
    const status = data.status as string | undefined;

    const functionCalls = extractFunctionCalls(data);
    if (functionCalls.length) {
      const outputItems = (data.output as Array<Record<string, unknown>>) || [];
      const toolOutputs: Array<Record<string, unknown>> = [];

      for (const fc of functionCalls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(fc.arguments || "{}");
        } catch {
          args = {};
        }
        const toolResult = await executeAgentTool(fc.name, args, opts.browserCtx, state);
        toolOutputs.push({
          type: "function_call_output",
          call_id: fc.call_id,
          output: JSON.stringify(toolResult),
        });
      }

      previousResponseId = data.id as string | undefined;
      input = toolOutputs;
      modeIndex = 0;
      continue;
    }

    const text = extractTextFromResponse(data);
    if (text) return text;

    if (status === "failed") {
      const err = data.error as { message?: string } | undefined;
      throw new Error(err?.message || "OpenAI response failed");
    }

    if (modeIndex < modes.length - 1) {
      modeIndex++;
      continue;
    }

    throw new Error("No text in OpenAI Responses output");
  }

  throw new Error("OpenAI Responses tool loop exceeded maximum rounds");
}

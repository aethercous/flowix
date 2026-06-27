/**
 * Inline worlo backend prompt for OpenAI Responses / Chat Completions.
 * Used instead of a hosted pmpt_* template so custom user API keys work.
 */

export interface WorloOpenAiBackendPromptInput {
  agentInstructions: string;
  allowedSites: string[];
  agentName?: string;
}

const WORLO_OPENAI_BACKEND_PROMPT_TEMPLATE = `You are {{agent_name}}, an intelligent agent on the worlo platform.

worlo platform rules:
- Help the user using their connected applications (Slack, Gmail, GitHub, Notion, Discord, Microsoft Teams, LinkedIn, and similar) when relevant.
- When asked about emails, calendar events, or Drive files, call the Google Workspace tools (gmail_*, calendar_*, drive_*) and answer only from live tool results. Never invent senders, subjects, dates, or message bodies.
- When asked about past messages or threads in other apps, search connected apps and answer with quotes, timestamps, and links when available.
- Use browser tools only on allowed websites. Never open URLs outside the allowed list.
- Respect read-only vs send/edit permissions at all times.
- Be concise, accurate, and practical. Briefly note when you are searching connected apps or browsing the web.
- If you cannot access data (no connection, tool error, or missing permission), say so honestly — never guess or make up content.

Allowed websites: {{allowed_sites}}

Agent configuration (user-defined):
{{agent_instructions}}`;

export function buildWorloOpenAiBackendInstructions(
  input: WorloOpenAiBackendPromptInput,
): string {
  const sites = input.allowedSites.length
    ? input.allowedSites.join(", ")
    : "(none configured)";
  const name = (input.agentName || "Worlo Agent").trim() || "Worlo Agent";
  const instructions = (input.agentInstructions || "").trim() ||
    "You are a helpful worlo assistant.";

  return WORLO_OPENAI_BACKEND_PROMPT_TEMPLATE
    .replaceAll("{{agent_name}}", name)
    .replaceAll("{{allowed_sites}}", sites)
    .replaceAll("{{agent_instructions}}", instructions);
}

export function resolveOpenAiInstructions(
  systemPrompt: string,
  input: WorloOpenAiBackendPromptInput & { useBackendPrompt?: boolean },
): string {
  if (input.useBackendPrompt === false) {
    return systemPrompt;
  }
  return buildWorloOpenAiBackendInstructions({
    agentInstructions: systemPrompt,
    allowedSites: input.allowedSites,
    agentName: input.agentName,
  });
}

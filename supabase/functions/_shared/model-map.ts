/** Map dashboard model ids to provider API model names. */
export function resolveApiModel(providerPrefix: string, rawModel: string | undefined): string {
  const m = (rawModel || "").toLowerCase().trim();

  if (providerPrefix === "anthropic") {
    if (!m || m === "claude-sonnet" || m.includes("sonnet")) {
      return "claude-3-5-sonnet-20241022";
    }
    if (m === "claude-opus" || m.includes("opus")) {
      return "claude-3-opus-20240229";
    }
    if (m.startsWith("claude-")) return rawModel!;
    return "claude-3-5-sonnet-20241022";
  }

  if (providerPrefix === "openai") {
    if (!m || m === "gpt-4" || m === "openai-custom") return "gpt-4o";
    if (m === "gpt-4o-mini") return "gpt-4o-mini";
    return rawModel!;
  }

  if (providerPrefix === "google") {
    if (!m || m.includes("gemini")) return m.includes("gemini") ? rawModel! : "gemini-1.5-pro";
    return rawModel!;
  }

  return rawModel || "gpt-4o";
}

export function modelSupportsReasoning(model: string): boolean {
  const m = model.toLowerCase();
  return (
    m.includes("gpt-5") ||
    m.includes("o1") ||
    m.includes("o3") ||
    m.includes("o4") ||
    m.startsWith("o1-") ||
    m.startsWith("o3-") ||
    m.startsWith("o4-")
  );
}

export function shouldUseOpenAiResponses(model: string): boolean {
  const m = model.toLowerCase();
  // Responses API + web_search/reasoning work best on newer OpenAI models
  return m.includes("gpt-4o") || m.includes("gpt-5") || m.includes("o1") || m.includes("o3") ||
    m.includes("o4");
}

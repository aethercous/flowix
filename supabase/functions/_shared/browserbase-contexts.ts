/**
 * Browserbase Contexts API helpers and cookie/header injection utilities.
 *
 * A Browserbase Context persists cookies + storage across sessions. We create
 * exactly one per `user_connections` row (per user+provider). The context id
 * lives in `user_connections.browserbase_context_id` so the agent reuses the
 * same logged-in browser profile every time.
 *
 * Cookies and HTTP headers are seeded into the live session via CDP after the
 * session is attached, so OAuth bearer tokens minted by Supabase can stand in
 * for an interactive login on providers that accept them (e.g. Slack/Notion
 * REST APIs).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type {
  BrowserProvider,
  ProviderCookieRule,
  ProviderHeaderRule,
} from "./connection-providers.ts";

const BB_API = "https://api.browserbase.com/v1";

function bbApiKey(): string {
  const key = Deno.env.get("BROWSERBASE_API_KEY");
  if (!key) throw new Error("Browserbase API key is not configured");
  return key;
}

function bbProjectId(): string {
  const id = Deno.env.get("BROWSERBASE_PROJECT_ID");
  if (!id) throw new Error("Browserbase project id is not configured");
  return id;
}

/** Create a new persistent context, returning its id. */
export async function createBrowserbaseContext(): Promise<string> {
  const res = await fetch(`${BB_API}/contexts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-BB-API-Key": bbApiKey(),
    },
    body: JSON.stringify({ projectId: bbProjectId() }),
  });
  if (!res.ok) {
    throw new Error(`Browserbase context creation failed: ${await res.text()}`);
  }
  const data = await res.json() as { id?: string };
  if (!data.id) throw new Error("Browserbase returned no context id");
  return data.id;
}

/**
 * Ensure each connected user_connection has a Browserbase context id. The id
 * is persisted in `user_connections.browserbase_context_id` and returned in
 * the same row.
 */
export async function ensureContextForUserConnection(
  supabase: SupabaseClient,
  userConnectionId: string,
  existingContextId: string | null | undefined,
): Promise<string> {
  if (existingContextId) return existingContextId;
  const ctxId = await createBrowserbaseContext();
  const { error } = await supabase
    .from("user_connections")
    .update({ browserbase_context_id: ctxId, updated_at: new Date().toISOString() })
    .eq("id", userConnectionId);
  if (error) {
    console.warn("Failed to persist browserbase_context_id:", error.message);
  }
  return ctxId;
}

/**
 * Build the cookies payload Browserbase accepts in `POST /v1/sessions` to seed
 * an authenticated session for the given provider.
 */
export function buildAuthCookies(
  provider: BrowserProvider,
  accessToken: string,
): Array<Record<string, unknown>> {
  if (!provider.cookies?.length) return [];
  return provider.cookies.map((rule: ProviderCookieRule) => {
    const value = rule.asBearer ? `Bearer ${accessToken}` : accessToken;
    return {
      name: rule.name,
      value,
      domain: rule.domain.startsWith(".") ? rule.domain : `.${rule.domain}`,
      path: rule.path || "/",
      httpOnly: false,
      secure: rule.secure !== false,
      sameSite: "Lax",
    };
  });
}

/**
 * Build the per-host header map for `Network.setExtraHTTPHeaders` (applied
 * via CDP after the session is connected, since the REST sessions API does
 * not accept extra headers).
 */
export function buildAuthHeaders(
  provider: BrowserProvider,
  accessToken: string,
): Record<string, string> {
  const headers: Record<string, string> = {};
  if (!provider.headers?.length) return headers;
  for (const rule of provider.headers as ProviderHeaderRule[]) {
    if (rule.staticValue) {
      headers[rule.name] = rule.staticValue;
    } else {
      headers[rule.name] = rule.asBearer ? `Bearer ${accessToken}` : accessToken;
    }
  }
  return headers;
}

/** Fetch connectUrl for an existing session (fallback if create response omitted it). */
export async function getSessionConnectUrl(sessionId: string): Promise<string | null> {
  const res = await fetch(`${BB_API}/sessions/${sessionId}`, {
    headers: { "X-BB-API-Key": bbApiKey() },
  });
  if (!res.ok) return null;
  const data = await res.json() as { connectUrl?: string };
  return data.connectUrl ?? null;
}

/**
 * Apply OAuth bearer headers via CDP on the live Browserbase session. Headers are
 * global per CDP connection, so callers should invoke this right before navigating
 * to a provider host (see ensureAuthForUrl in browser-runtime.ts).
 */
export async function applyAuthHeadersViaCdp(
  connectUrl: string,
  headers: Record<string, string>,
  timeoutMs = 10_000,
): Promise<boolean> {
  if (!connectUrl || !Object.keys(headers).length) return false;

  return await new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      resolve(ok);
    };

    const timer = setTimeout(() => finish(false), timeoutMs);
    let ws: WebSocket;
    try {
      ws = new WebSocket(connectUrl);
    } catch (err) {
      console.warn("CDP WebSocket connect failed:", err);
      finish(false);
      return;
    }

    let msgId = 1;
    const send = (method: string, params: Record<string, unknown> = {}) => {
      try {
        ws.send(JSON.stringify({ id: msgId++, method, params }));
      } catch (err) {
        console.warn(`CDP send ${method} failed:`, err);
      }
    };

    ws.onopen = () => {
      send("Network.enable");
      send("Network.setExtraHTTPHeaders", { headers });
      setTimeout(() => finish(true), 400);
    };

    ws.onerror = () => finish(false);
    ws.onclose = () => {
      if (!settled) finish(false);
    };
  });
}

export interface ApplyProviderAuthResult {
  cookiesApplied: boolean;
  headersApplied: boolean;
  hasContext: boolean;
}

/**
 * Seed a Browserbase session with cookies and/or bearer headers for one connected
 * provider. Returns which auth mechanisms succeeded.
 */
export async function applyProviderAuthToSession(
  sessionId: string,
  connectUrl: string | null | undefined,
  provider: BrowserProvider,
  accessToken: string,
  browserbaseContextId: string | null | undefined,
): Promise<ApplyProviderAuthResult> {
  const cookies = buildAuthCookies(provider, accessToken);
  const cookiesApplied = cookies.length
    ? await applyCookiesToSession(sessionId, cookies)
    : false;

  const headers = buildAuthHeaders(provider, accessToken);
  let headersApplied = false;
  if (Object.keys(headers).length) {
    const url = connectUrl || await getSessionConnectUrl(sessionId);
    if (url) {
      headersApplied = await applyAuthHeadersViaCdp(url, headers);
    }
  }

  const hasContext = Boolean(provider.usesContext && browserbaseContextId);
  return { cookiesApplied, headersApplied, hasContext };
}

/** True when the provider has usable auth wired for Browserbase. */
export function providerAuthIsActive(result: ApplyProviderAuthResult): boolean {
  return result.cookiesApplied || result.headersApplied || result.hasContext;
}

/**
 * Push cookies into an active Browserbase session via the REST cookies route.
 * Returns true if at least one cookie was applied.
 */
export async function applyCookiesToSession(
  sessionId: string,
  cookies: Array<Record<string, unknown>>,
): Promise<boolean> {
  if (!cookies.length) return false;
  const res = await fetch(`${BB_API}/sessions/${sessionId}/cookies`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-BB-API-Key": bbApiKey(),
    },
    body: JSON.stringify({ cookies }),
  });
  if (!res.ok) {
    const detail = await res.text();
    console.warn(`Browserbase cookie injection failed: ${detail}`);
    return false;
  }
  return true;
}

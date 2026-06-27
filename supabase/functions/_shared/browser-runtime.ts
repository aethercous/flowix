import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isUrlAllowed, parseAllowedUrls } from "./url-allowlist.ts";
import {
  normalizePermissions,
  READ_BROWSER_ACTIONS,
  WRITE_BROWSER_ACTIONS,
} from "./agent-permissions.ts";
import {
  googleWorkspaceSystemPromptBlock,
  hasGoogleConnection,
} from "./google-workspace-tools.ts";
import {
  type AgentConnection,
  loadAgentConnections,
} from "./agent-connections.ts";
import {
  applyProviderAuthToSession,
  ensureContextForUserConnection,
  getSessionConnectUrl,
  providerAuthIsActive,
} from "./browserbase-contexts.ts";
import {
  type BrowserProvider,
  findProviderForHost,
  getBrowserProvider,
  hostFromUrl,
} from "./connection-providers.ts";

export type BrowserActionName =
  | "browse_url"
  | "take_screenshot"
  | "click_element"
  | "type_text"
  | "get_page_content"
  | "scroll"
  | "go_back"
  | "go_forward";

export interface AgentIdentity {
  userId: string;
  agentId: string;
  supabase: SupabaseClient;
}

export interface BrowserRuntimeContext {
  allowedUrls: string[];
  /** When true, browse_url is not limited to allowedUrls. */
  unrestrictedBrowsing: boolean;
  perms: ReturnType<typeof normalizePermissions>;
  identity?: AgentIdentity;
  /**
   * Cached agent connections loaded from Supabase on first use. Each entry has
   * the OAuth access token, refresh token, and the persistent Browserbase
   * context id we attach to new sessions.
   */
  connections?: AgentConnection[];
  /** WebSocket URL for the active Browserbase session (for CDP header injection). */
  activeSessionConnectUrl?: string | null;
}

export interface CreateSessionResult {
  sessionId: string;
  connectUrl?: string;
  debugUrl?: string;
  /** Providers whose context/cookies/headers were applied to the session. */
  attachedProviders: string[];
}

const BROWSERBASE_API = "https://api.browserbase.com/v1";
const BROWSERBASE_SESSIONS = "https://www.browserbase.com/v1/sessions";

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

/**
 * Load (and cache) the connected OAuth accounts for this agent. Returns an
 * empty array if no identity is attached (e.g. unauthenticated browser test).
 */
export async function loadConnectionsForCtx(
  ctx: BrowserRuntimeContext,
): Promise<AgentConnection[]> {
  if (ctx.connections) return ctx.connections;
  if (!ctx.identity) {
    ctx.connections = [];
    return ctx.connections;
  }
  ctx.connections = await loadAgentConnections(
    ctx.identity.supabase,
    ctx.identity.userId,
    ctx.identity.agentId,
  );
  return ctx.connections;
}

/**
 * Pick the connection that matches a URL the agent is about to open.
 * `null` means we have no auth to inject for this host.
 */
export function matchConnectionForUrl(
  url: string,
  connections: AgentConnection[],
): { connection: AgentConnection; provider: BrowserProvider } | null {
  const host = hostFromUrl(url);
  if (!host) return null;
  const provider = findProviderForHost(host);
  if (!provider) return null;
  const connection = connections.find((c) => c.provider === provider.id);
  if (!connection) return null;
  return { connection, provider };
}

/**
 * Create a Browserbase session. When `startUrl` matches a connected provider,
 * we attach that user's persistent context and seed the session with cookies
 * and bearer-token headers so the agent is already authenticated.
 */
export async function createBrowserSession(
  ctx: BrowserRuntimeContext,
  startUrl?: string,
): Promise<CreateSessionResult> {
  const connections = await loadConnectionsForCtx(ctx);

  let contextId: string | null = null;
  let primaryProvider: BrowserProvider | null = null;
  let primaryConnection: AgentConnection | null = null;

  if (startUrl) {
    const match = matchConnectionForUrl(startUrl, connections);
    if (match) {
      primaryProvider = match.provider;
      primaryConnection = match.connection;
    }
  }

  if (!primaryConnection && connections.length === 1) {
    const only = connections[0];
    const prov = getBrowserProvider(only.provider);
    if (prov) {
      primaryConnection = only;
      primaryProvider = prov;
    }
  }

  if (ctx.identity) {
    for (const connection of connections) {
      const prov = getBrowserProvider(connection.provider);
      if (!prov?.usesContext) continue;
      const ctxId = await ensureContextForUserConnection(
        ctx.identity.supabase,
        connection.user_connection_id,
        connection.browserbase_context_id,
      );
      if (ctxId) connection.browserbase_context_id = ctxId;
      if (connection === primaryConnection) contextId = ctxId;
    }
  }

  const sessionPayload: Record<string, unknown> = {
    projectId: bbProjectId(),
    keepAlive: true,
  };
  if (startUrl) sessionPayload.startUrl = startUrl;
  if (contextId) {
    sessionPayload.browserSettings = { context: { id: contextId, persist: true } };
  }

  const res = await fetch(BROWSERBASE_SESSIONS, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-BB-API-Key": bbApiKey(),
    },
    body: JSON.stringify(sessionPayload),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Browserbase session creation failed: ${detail}`);
  }

  const data = await res.json();
  const sessionId = data.id as string;
  let connectUrl = (data.connectUrl as string | undefined) ?? null;
  if (!connectUrl) {
    connectUrl = await getSessionConnectUrl(sessionId);
  }
  ctx.activeSessionConnectUrl = connectUrl;

  const attachedProviders: string[] = [];

  const authTargets: Array<{ connection: AgentConnection; provider: BrowserProvider }> = [];
  if (primaryProvider && primaryConnection) {
    authTargets.push({ connection: primaryConnection, provider: primaryProvider });
  } else if (connections.length === 1) {
    const only = connections[0];
    const prov = getBrowserProvider(only.provider);
    if (prov && only.access_token) {
      authTargets.push({ connection: only, provider: prov });
    }
  }

  for (const { connection, provider } of authTargets) {
    if (!connection.access_token) continue;
    const authResult = await applyProviderAuthToSession(
      sessionId,
      connectUrl,
      provider,
      connection.access_token,
      connection.browserbase_context_id,
    );
    if (providerAuthIsActive(authResult) && !attachedProviders.includes(provider.id)) {
      attachedProviders.push(provider.id);
    }
  }

  return {
    sessionId,
    connectUrl: connectUrl ?? undefined,
    debugUrl: data.debugViewerUrl as string | undefined,
    attachedProviders,
  };
}

export function assertBrowserActionAllowed(
  action: BrowserActionName,
  ctx: BrowserRuntimeContext,
  url?: string,
): void {
  if (READ_BROWSER_ACTIONS.has(action) && !ctx.perms.can_read_navigate) {
    throw new Error("This agent is not allowed to read or navigate the web");
  }
  if (WRITE_BROWSER_ACTIONS.has(action) && !ctx.perms.can_send_edit) {
    throw new Error("This agent is read-only and cannot send messages or edit content");
  }
  if (action === "browse_url") {
    if (!url) throw new Error("url is required for browse_url");
    if (!ctx.unrestrictedBrowsing) {
      if (!ctx.allowedUrls.length) {
        throw new Error("No allowed websites configured for this agent");
      }
      if (!isUrlAllowed(url, ctx.allowedUrls)) {
        throw new Error(
          `URL is not allowed. Connected sites only: ${ctx.allowedUrls.join(", ")}`,
        );
      }
    }
  }
}

/**
 * Before navigating to a host that matches a connected provider, push that
 * provider's cookies into the live session so the navigation lands logged in.
 */
async function ensureAuthForUrl(
  ctx: BrowserRuntimeContext,
  sessionId: string,
  url: string,
): Promise<void> {
  const connections = await loadConnectionsForCtx(ctx);
  if (!connections.length) return;
  const match = matchConnectionForUrl(url, connections);
  if (!match) return;
  if (!match.connection.access_token) return;

  const connectUrl = ctx.activeSessionConnectUrl ?? await getSessionConnectUrl(sessionId);
  if (connectUrl) ctx.activeSessionConnectUrl = connectUrl;

  await applyProviderAuthToSession(
    sessionId,
    connectUrl,
    match.provider,
    match.connection.access_token,
    match.connection.browserbase_context_id,
  );
}

export async function runBrowserAction(
  browserSessionId: string,
  action: BrowserActionName,
  params: {
    url?: string;
    selector?: string;
    text?: string;
    scrollAmount?: number;
  },
  ctx: BrowserRuntimeContext,
): Promise<Record<string, unknown>> {
  assertBrowserActionAllowed(action, ctx, params.url);

  const apiKey = bbApiKey();

  switch (action) {
    case "browse_url": {
      await ensureAuthForUrl(ctx, browserSessionId, params.url!);
      const res = await fetch(`${BROWSERBASE_API}/sessions/${browserSessionId}/commands`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          command: "goto",
          parameters: { url: params.url },
        }),
      });
      if (!res.ok) throw new Error(`Browserbase navigate failed: ${await res.text()}`);
      return {
        action,
        url: params.url,
        status: "success",
        message: `Navigated to ${params.url}`,
      };
    }
    case "take_screenshot": {
      const res = await fetch(`${BROWSERBASE_API}/sessions/${browserSessionId}/screenshot`, {
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) throw new Error(`Browserbase screenshot failed: ${await res.text()}`);
      const screenshotData = await res.json();
      return { action, status: "success", screenshot: screenshotData, message: "Screenshot captured" };
    }
    case "click_element": {
      if (!params.selector) throw new Error("selector is required for click_element");
      const res = await fetch(`${BROWSERBASE_API}/sessions/${browserSessionId}/commands`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          command: "click",
          parameters: { selector: params.selector },
        }),
      });
      if (!res.ok) throw new Error(`Browserbase click failed: ${await res.text()}`);
      return {
        action,
        selector: params.selector,
        status: "success",
        message: `Clicked element: ${params.selector}`,
      };
    }
    case "type_text": {
      if (!params.text) throw new Error("text is required for type_text");
      const res = await fetch(`${BROWSERBASE_API}/sessions/${browserSessionId}/commands`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          command: "type",
          parameters: { text: params.text },
        }),
      });
      if (!res.ok) throw new Error(`Browserbase type failed: ${await res.text()}`);
      return { action, text: params.text, status: "success", message: `Typed: ${params.text}` };
    }
    case "get_page_content": {
      const res = await fetch(`${BROWSERBASE_API}/sessions/${browserSessionId}/html`, {
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) throw new Error(`Browserbase HTML failed: ${await res.text()}`);
      const content = await res.json();
      const text = typeof content === "string"
        ? content.slice(0, 12000)
        : JSON.stringify(content).slice(0, 12000);
      return { action, status: "success", content: text, message: "Page content retrieved" };
    }
    case "scroll": {
      const amount = params.scrollAmount ?? 500;
      const res = await fetch(`${BROWSERBASE_API}/sessions/${browserSessionId}/commands`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          command: "scroll",
          parameters: { amount },
        }),
      });
      if (!res.ok) throw new Error(`Browserbase scroll failed: ${await res.text()}`);
      return { action, amount, status: "success", message: `Scrolled ${amount}px` };
    }
    case "go_back":
    case "go_forward": {
      const command = action === "go_back" ? "back" : "forward";
      const res = await fetch(`${BROWSERBASE_API}/sessions/${browserSessionId}/commands`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ command, parameters: {} }),
      });
      if (!res.ok) throw new Error(`Browserbase ${command} failed: ${await res.text()}`);
      return { action, status: "success", message: `Navigated ${command}` };
    }
    default:
      throw new Error(`Unknown browser action: ${action}`);
  }
}

export function buildBrowserRuntimeContext(
  agentRow: {
    allowed_urls?: unknown;
    unrestricted_browsing?: boolean;
    can_read_navigate?: boolean;
    can_send_edit?: boolean;
  } | null | undefined,
  identity?: AgentIdentity,
): BrowserRuntimeContext {
  return {
    allowedUrls: parseAllowedUrls(agentRow?.allowed_urls),
    unrestrictedBrowsing: !!agentRow?.unrestricted_browsing,
    perms: normalizePermissions(agentRow ?? undefined),
    identity,
  };
}

/**
 * Used by callers (e.g. agent-invoke) to surface "Auth is wired" for the
 * system prompt so the model knows which connected accounts it can use.
 */
export async function describeConnectionsForPrompt(
  ctx: BrowserRuntimeContext,
): Promise<string> {
  if (!ctx.identity) return "";
  const connections = await loadConnectionsForCtx(ctx);
  if (!connections.length) {
    return googleWorkspaceSystemPromptBlock(false);
  }

  const names = connections
    .map((c) => `${c.provider}${c.account_label ? ` (${c.account_label})` : ""}`)
    .join(", ");
  let block = `\n\nConnected accounts available to the agent: ${names}. When you browse a matching site, the server injects the stored OAuth access token into the Browserbase session (bearer headers and/or a persistent browser context). For full web-app login on some sites, the user may need a one-time interactive sign-in in the browser context. Never ask the user for passwords.`;
  block += googleWorkspaceSystemPromptBlock(hasGoogleConnection(connections));
  return block;
}

/** Re-export so other modules don't need to depend on the helper directly. */
export { hostFromUrl, getBrowserProvider };

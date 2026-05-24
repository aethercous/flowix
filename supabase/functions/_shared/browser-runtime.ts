import { isUrlAllowed, parseAllowedUrls } from "./url-allowlist.ts";
import {
  normalizePermissions,
  READ_BROWSER_ACTIONS,
  WRITE_BROWSER_ACTIONS,
} from "./agent-permissions.ts";

export type BrowserActionName =
  | "browse_url"
  | "take_screenshot"
  | "click_element"
  | "type_text"
  | "get_page_content"
  | "scroll"
  | "go_back"
  | "go_forward";

export interface BrowserRuntimeContext {
  allowedUrls: string[];
  perms: ReturnType<typeof normalizePermissions>;
}

export interface CreateSessionResult {
  sessionId: string;
  connectUrl?: string;
  debugUrl?: string;
}

const BROWSERBASE_API = "https://api.browserbase.com/v1";
const BROWSERBASE_SESSIONS = "https://www.browserbase.com/v1/sessions";

export async function createBrowserSession(
  startUrl?: string,
): Promise<CreateSessionResult> {
  const bbApiKey = Deno.env.get("BROWSERBASE_API_KEY");
  const bbProjectId = Deno.env.get("BROWSERBASE_PROJECT_ID");
  if (!bbApiKey || !bbProjectId) {
    throw new Error("Browserbase credentials are not configured");
  }

  const sessionPayload: Record<string, unknown> = {
    projectId: bbProjectId,
    keepAlive: true,
  };
  if (startUrl) sessionPayload.startUrl = startUrl;

  const res = await fetch(BROWSERBASE_SESSIONS, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-BB-API-Key": bbApiKey,
    },
    body: JSON.stringify(sessionPayload),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Browserbase session creation failed: ${detail}`);
  }

  const data = await res.json();
  return {
    sessionId: data.id as string,
    connectUrl: data.connectUrl as string | undefined,
    debugUrl: data.debugViewerUrl as string | undefined,
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

  const bbApiKey = Deno.env.get("BROWSERBASE_API_KEY");
  if (!bbApiKey) throw new Error("Browserbase API key is not configured");

  switch (action) {
    case "browse_url": {
      const res = await fetch(`${BROWSERBASE_API}/sessions/${browserSessionId}/commands`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${bbApiKey}`,
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
        headers: { Authorization: `Bearer ${bbApiKey}` },
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
          Authorization: `Bearer ${bbApiKey}`,
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
          Authorization: `Bearer ${bbApiKey}`,
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
        headers: { Authorization: `Bearer ${bbApiKey}` },
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
          Authorization: `Bearer ${bbApiKey}`,
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
          Authorization: `Bearer ${bbApiKey}`,
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

export function buildBrowserRuntimeContext(agentRow: {
  allowed_urls?: unknown;
  can_read_navigate?: boolean;
  can_send_edit?: boolean;
} | null | undefined): BrowserRuntimeContext {
  return {
    allowedUrls: parseAllowedUrls(agentRow?.allowed_urls),
    perms: normalizePermissions(agentRow ?? undefined),
  };
}

import { isUrlAllowed } from "./url-allowlist.ts";
import {
  type BrowserRuntimeContext,
  createBrowserSession,
  loadConnectionsForCtx,
  matchConnectionForUrl,
  runBrowserAction,
  type BrowserActionName,
} from "./browser-runtime.ts";
import {
  buildGoogleWorkspaceToolDefinitions,
  executeGoogleWorkspaceTool,
  googleWorkspaceToolsEnabled,
} from "./google-workspace-tools.ts";

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface AgentToolState {
  browserSessionId: string | null;
}

export function webToolsEnabled(ctx: BrowserRuntimeContext): boolean {
  return ctx.perms.can_read_navigate &&
    (ctx.unrestrictedBrowsing || ctx.allowedUrls.length > 0);
}

/** Browser + Google Workspace tools available to the agent. */
export async function buildAllToolDefinitions(
  ctx: BrowserRuntimeContext,
): Promise<ToolDefinition[]> {
  const tools: ToolDefinition[] = [];
  if (await googleWorkspaceToolsEnabled(ctx)) {
    tools.push(...buildGoogleWorkspaceToolDefinitions());
  }
  if (webToolsEnabled(ctx)) {
    tools.push(...buildWebToolDefinitions(ctx));
  }
  return tools;
}

export function buildWebToolDefinitions(ctx: BrowserRuntimeContext): ToolDefinition[] {
  const sites = ctx.unrestrictedBrowsing
    ? "any website on the internet"
    : ctx.allowedUrls.join(", ");
  const readOnly = ctx.perms.can_read_navigate && !ctx.perms.can_send_edit;

  const tools: ToolDefinition[] = [
    {
      name: "start_browser",
      description:
        `Start a live Browserbase web session. You may visit ${sites}. If a connected account exists for that site, the session is automatically signed in using the user's OAuth credentials stored in Supabase. Call this before other browser tools.`,
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: ctx.unrestrictedBrowsing
              ? "Optional starting URL"
              : `Optional starting URL (must be one of: ${ctx.allowedUrls.join(", ")})`,
          },
        },
      },
    },
    {
      name: "browse_url",
      description: ctx.unrestrictedBrowsing
        ? "Navigate the browser to any URL."
        : `Navigate the browser to a URL. Only allowed connected sites: ${ctx.allowedUrls.join(", ")}.`,
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "Full URL to open" },
        },
        required: ["url"],
      },
    },
    {
      name: "get_page_content",
      description: "Read the current page HTML/text from the active browser session.",
      parameters: { type: "object", properties: {} },
    },
    {
      name: "take_screenshot",
      description: "Capture a screenshot of the current browser page.",
      parameters: { type: "object", properties: {} },
    },
    {
      name: "scroll",
      description: "Scroll the page down (or up with negative amount).",
      parameters: {
        type: "object",
        properties: {
          scrollAmount: { type: "number", description: "Pixels to scroll (default 500)" },
        },
      },
    },
    {
      name: "go_back",
      description: "Browser back button.",
      parameters: { type: "object", properties: {} },
    },
    {
      name: "go_forward",
      description: "Browser forward button.",
      parameters: { type: "object", properties: {} },
    },
  ];

  if (!readOnly) {
    tools.push(
      {
        name: "click_element",
        description: "Click a CSS selector on the page (write action).",
        parameters: {
          type: "object",
          properties: {
            selector: { type: "string", description: "CSS selector" },
          },
          required: ["selector"],
        },
      },
      {
        name: "type_text",
        description: "Type text into the focused field (write action).",
        parameters: {
          type: "object",
          properties: {
            text: { type: "string", description: "Text to type" },
          },
          required: ["text"],
        },
      },
    );
  }

  return tools;
}

export function webAccessSystemPromptBlock(ctx: BrowserRuntimeContext): string {
  if (!ctx.perms.can_read_navigate) {
    return "\n\nWeb access: DISABLED. You cannot browse the internet for this agent.";
  }
  if (ctx.unrestrictedBrowsing) {
    return "\n\nWeb access: ENABLED via Browserbase tools (unrestricted mode). You may browse any website. When the user has connected an account for a site (Slack, Google, Notion, GitHub, Discord, Teams, LinkedIn, …), the session is automatically signed in via stored OAuth credentials — do not prompt the user for passwords. When you use the web, say so briefly so the user knows you are browsing live data.";
  }
  if (!ctx.allowedUrls.length) {
    return "\n\nWeb access: DISABLED. Add allowed websites or enable unrestricted browsing for this agent.";
  }
  const sites = ctx.allowedUrls.join(", ");
  return `\n\nWeb access: ENABLED via Browserbase tools. You have live browser tools (start_browser, browse_url, get_page_content, take_screenshot, scroll, etc.). You may ONLY visit these connected websites: ${sites}. Never navigate to URLs outside this list — the server will block them. When the user has connected an account for a site (Slack, Google, Notion, GitHub, Discord, Teams, LinkedIn, …), the session is automatically signed in via the stored OAuth credentials — do not prompt the user for passwords. When you use the web, say so briefly so the user knows you are browsing live data.`;
}

const GOOGLE_WORKSPACE_TOOL_NAMES = new Set([
  "gmail_list_messages",
  "gmail_search",
  "gmail_get_message",
  "calendar_list_events",
  "drive_search_files",
]);

export async function executeAgentTool(
  name: string,
  args: Record<string, unknown>,
  ctx: BrowserRuntimeContext,
  state: AgentToolState,
): Promise<Record<string, unknown>> {
  if (GOOGLE_WORKSPACE_TOOL_NAMES.has(name)) {
    return executeGoogleWorkspaceTool(name, args, ctx);
  }

  if (name === "start_browser") {
    const url = typeof args.url === "string" ? args.url : undefined;
    if (url && !ctx.unrestrictedBrowsing && !isUrlAllowed(url, ctx.allowedUrls)) {
      return {
        error: `URL not allowed. Connected sites only: ${ctx.allowedUrls.join(", ")}`,
      };
    }
    const session = await createBrowserSession(ctx, url);
    state.browserSessionId = session.sessionId;
    ctx.activeSessionConnectUrl = session.connectUrl ?? ctx.activeSessionConnectUrl ?? null;

    const connections = await loadConnectionsForCtx(ctx);
    const accounts = connections.map((c) => c.provider);

    return {
      status: "success",
      browserSessionId: session.sessionId,
      attachedAccounts: session.attachedProviders,
      availableAccounts: accounts,
      message: url
        ? session.attachedProviders.length
          ? `Browser started at ${url} (signed in via ${session.attachedProviders.join(", ")})`
          : `Browser started at ${url}`
        : "Browser session started. Use browse_url to open a connected site.",
      allowedSites: ctx.allowedUrls,
    };
  }

  if (!state.browserSessionId) {
    return { error: "No browser session. Call start_browser first." };
  }

  const sessionId = state.browserSessionId;

  const actionMap: Record<string, BrowserActionName> = {
    browse_url: "browse_url",
    get_page_content: "get_page_content",
    take_screenshot: "take_screenshot",
    scroll: "scroll",
    go_back: "go_back",
    go_forward: "go_forward",
    click_element: "click_element",
    type_text: "type_text",
  };

  const action = actionMap[name];
  if (!action) {
    return { error: `Unknown tool: ${name}` };
  }

  try {
    const result = await runBrowserAction(
      sessionId,
      action,
      {
        url: typeof args.url === "string" ? args.url : undefined,
        selector: typeof args.selector === "string" ? args.selector : undefined,
        text: typeof args.text === "string" ? args.text : undefined,
        scrollAmount: typeof args.scrollAmount === "number" ? args.scrollAmount : undefined,
      },
      ctx,
    );

    if (action === "browse_url" && typeof args.url === "string") {
      const connections = await loadConnectionsForCtx(ctx);
      const match = matchConnectionForUrl(args.url, connections);
      if (match) {
        (result as Record<string, unknown>).signedInAs = match.provider.id;
      }
    }

    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: msg };
  }
}

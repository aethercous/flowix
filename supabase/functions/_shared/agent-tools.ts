import { isUrlAllowed } from "./url-allowlist.ts";
import {
  type BrowserRuntimeContext,
  createBrowserSession,
  runBrowserAction,
  type BrowserActionName,
} from "./browser-runtime.ts";

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface AgentToolState {
  browserSessionId: string | null;
}

export function webToolsEnabled(ctx: BrowserRuntimeContext): boolean {
  return ctx.perms.can_read_navigate && ctx.allowedUrls.length > 0;
}

export function buildWebToolDefinitions(ctx: BrowserRuntimeContext): ToolDefinition[] {
  const sites = ctx.allowedUrls.join(", ");
  const readOnly = ctx.perms.can_read_navigate && !ctx.perms.can_send_edit;

  const tools: ToolDefinition[] = [
    {
      name: "start_browser",
      description:
        `Start a live Browserbase web session. You may only visit connected sites: ${sites}. Call this before other browser tools.`,
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: `Optional starting URL (must be one of: ${sites})`,
          },
        },
      },
    },
    {
      name: "browse_url",
      description: `Navigate the browser to a URL. Only allowed connected sites: ${sites}.`,
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
  const sites = ctx.allowedUrls.join(", ");
  if (!ctx.perms.can_read_navigate || !ctx.allowedUrls.length) {
    return "\n\nWeb access: DISABLED. You cannot browse the internet for this agent.";
  }
  return `\n\nWeb access: ENABLED via Browserbase tools. You have live browser tools (start_browser, browse_url, get_page_content, take_screenshot, scroll, etc.). You may ONLY visit these connected websites: ${sites}. Never navigate to URLs outside this list — the server will block them. When you use the web, say so briefly so the user knows you are browsing live data.`;
}

export async function executeAgentTool(
  name: string,
  args: Record<string, unknown>,
  ctx: BrowserRuntimeContext,
  state: AgentToolState,
): Promise<Record<string, unknown>> {
  if (name === "start_browser") {
    const url = typeof args.url === "string" ? args.url : undefined;
    if (url && !isUrlAllowed(url, ctx.allowedUrls)) {
      return {
        error: `URL not allowed. Connected sites only: ${ctx.allowedUrls.join(", ")}`,
      };
    }
    const session = await createBrowserSession(url);
    state.browserSessionId = session.sessionId;
    return {
      status: "success",
      browserSessionId: session.sessionId,
      message: url
        ? `Browser started at ${url}`
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
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: msg };
  }
}

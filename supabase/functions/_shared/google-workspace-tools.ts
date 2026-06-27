import type { AgentConnection } from "./agent-connections.ts";
import { loadConnectionsForCtx, type BrowserRuntimeContext } from "./browser-runtime.ts";
import type { ToolDefinition } from "./agent-tools.ts";

interface GoogleAuth {
  token: string;
  label: string | null;
}

async function getGoogleAuth(ctx: BrowserRuntimeContext): Promise<GoogleAuth | null> {
  const connections = await loadConnectionsForCtx(ctx);
  const google = connections.find((c) => c.provider === "google" && c.access_token);
  if (!google?.access_token) return null;
  return { token: google.access_token, label: google.account_label };
}

async function googleApiFetch(
  url: string,
  token: string,
): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 600);
    throw new Error(`Google API ${res.status}: ${detail}`);
  }
  return await res.json() as Record<string, unknown>;
}

function headerValue(
  headers: Array<{ name?: string; value?: string }> | undefined,
  name: string,
): string {
  const h = headers?.find((x) => x.name?.toLowerCase() === name.toLowerCase());
  return h?.value?.trim() || "";
}

async function fetchGmailSummaries(
  token: string,
  messageIds: string[],
): Promise<Array<Record<string, unknown>>> {
  const results = await Promise.all(
    messageIds.slice(0, 15).map(async (id) => {
      const data = await googleApiFetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        token,
      );
      const headers = data.payload as { headers?: Array<{ name?: string; value?: string }> } | undefined;
      return {
        id,
        threadId: data.threadId,
        snippet: data.snippet,
        from: headerValue(headers?.headers, "From"),
        subject: headerValue(headers?.headers, "Subject"),
        date: headerValue(headers?.headers, "Date"),
        labelIds: data.labelIds,
      };
    }),
  );
  return results;
}

export async function googleWorkspaceToolsEnabled(
  ctx: BrowserRuntimeContext,
): Promise<boolean> {
  if (!ctx.perms.can_read_navigate) return false;
  const auth = await getGoogleAuth(ctx);
  return !!auth;
}

export function buildGoogleWorkspaceToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "gmail_list_messages",
      description:
        "List recent Gmail inbox messages for the connected Google Workspace account. Returns real sender, subject, date, and snippet for each message. Use this when the user asks about recent or new emails.",
      parameters: {
        type: "object",
        properties: {
          maxResults: {
            type: "number",
            description: "How many messages to return (1–20, default 10).",
          },
          label: {
            type: "string",
            description: "Gmail label id (default INBOX). Examples: INBOX, UNREAD, STARRED, SENT.",
          },
        },
      },
    },
    {
      name: "gmail_search",
      description:
        "Search Gmail using standard Gmail query syntax (from:, subject:, after:, before:, is:unread, etc.). Returns matching messages with sender, subject, date, and snippet.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Gmail search query." },
          maxResults: {
            type: "number",
            description: "Maximum results (1–20, default 10).",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "gmail_get_message",
      description:
        "Get the full body and metadata of a specific Gmail message by id (from gmail_list_messages or gmail_search).",
      parameters: {
        type: "object",
        properties: {
          messageId: { type: "string", description: "Gmail message id." },
        },
        required: ["messageId"],
      },
    },
    {
      name: "calendar_list_events",
      description:
        "List upcoming events from the user's primary Google Calendar.",
      parameters: {
        type: "object",
        properties: {
          maxResults: {
            type: "number",
            description: "Maximum events to return (1–20, default 10).",
          },
          daysAhead: {
            type: "number",
            description: "How many days ahead to search (default 14).",
          },
        },
      },
    },
    {
      name: "drive_search_files",
      description:
        "Search Google Drive files by name or full-text query. Returns file names, types, and modified dates.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search terms or Drive query (e.g. name contains 'budget').",
          },
          maxResults: {
            type: "number",
            description: "Maximum files to return (1–20, default 10).",
          },
        },
        required: ["query"],
      },
    },
  ];
}

export function googleWorkspaceSystemPromptBlock(hasGoogle: boolean): string {
  if (!hasGoogle) {
    return "\n\nGoogle Workspace: NOT connected for this agent. If the user asks about Gmail, Calendar, or Drive, tell them to connect Google Workspace under Dashboard → Connections and enable it for this agent. Do NOT invent or guess email contents.";
  }
  return `\n\nGoogle Workspace API: CONNECTED. You have gmail_list_messages, gmail_search, gmail_get_message, calendar_list_events, and drive_search_files tools that return live data from the user's Google account.

CRITICAL — never fabricate email or calendar data:
- When asked about emails, calendar events, or Drive files, you MUST call the appropriate Google Workspace tool first and base your answer only on the tool results.
- NEVER invent senders, subjects, dates, or message bodies. If a tool returns no results or an error, say so honestly.
- Briefly tell the user when you are fetching live Gmail/Calendar/Drive data.`;
}

export async function executeGoogleWorkspaceTool(
  name: string,
  args: Record<string, unknown>,
  ctx: BrowserRuntimeContext,
): Promise<Record<string, unknown>> {
  const auth = await getGoogleAuth(ctx);
  if (!auth) {
    return {
      error: "Google Workspace is not connected for this agent. Connect Google under Dashboard → Connections and link it to this agent.",
    };
  }

  try {
    switch (name) {
      case "gmail_list_messages":
        return await gmailListMessages(auth.token, args);
      case "gmail_search":
        return await gmailSearch(auth.token, args);
      case "gmail_get_message":
        return await gmailGetMessage(auth.token, args);
      case "calendar_list_events":
        return await calendarListEvents(auth.token, args);
      case "drive_search_files":
        return await driveSearchFiles(auth.token, args);
      default:
        return { error: `Unknown Google Workspace tool: ${name}` };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: msg, account: auth.label };
  }
}

async function gmailListMessages(
  token: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const maxResults = clampInt(args.maxResults, 1, 20, 10);
  const label = typeof args.label === "string" && args.label.trim()
    ? args.label.trim()
    : "INBOX";

  const list = await googleApiFetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&labelIds=${encodeURIComponent(label)}`,
    token,
  );
  const ids = ((list.messages as Array<{ id?: string }>) || [])
    .map((m) => m.id)
    .filter((id): id is string => typeof id === "string");

  if (!ids.length) {
    return { status: "success", count: 0, messages: [], label };
  }

  const messages = await fetchGmailSummaries(token, ids);
  return { status: "success", count: messages.length, label, messages };
}

async function gmailSearch(
  token: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const query = typeof args.query === "string" ? args.query.trim() : "";
  if (!query) return { error: "query is required" };

  const maxResults = clampInt(args.maxResults, 1, 20, 10);
  const list = await googleApiFetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&q=${encodeURIComponent(query)}`,
    token,
  );
  const ids = ((list.messages as Array<{ id?: string }>) || [])
    .map((m) => m.id)
    .filter((id): id is string => typeof id === "string");

  if (!ids.length) {
    return { status: "success", count: 0, query, messages: [] };
  }

  const messages = await fetchGmailSummaries(token, ids);
  return { status: "success", count: messages.length, query, messages };
}

async function gmailGetMessage(
  token: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const messageId = typeof args.messageId === "string" ? args.messageId.trim() : "";
  if (!messageId) return { error: "messageId is required" };

  const data = await googleApiFetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=full`,
    token,
  );

  const payload = data.payload as {
    headers?: Array<{ name?: string; value?: string }>;
    body?: { data?: string; size?: number };
    parts?: Array<{ mimeType?: string; body?: { data?: string }; parts?: unknown[] }>;
  } | undefined;

  const bodyText = extractEmailBody(payload);
  const headers = payload?.headers;

  return {
    status: "success",
    id: data.id,
    threadId: data.threadId,
    snippet: data.snippet,
    from: headerValue(headers, "From"),
    to: headerValue(headers, "To"),
    subject: headerValue(headers, "Subject"),
    date: headerValue(headers, "Date"),
    body: bodyText.slice(0, 12000),
  };
}

async function calendarListEvents(
  token: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const maxResults = clampInt(args.maxResults, 1, 20, 10);
  const daysAhead = clampInt(args.daysAhead, 1, 90, 14);
  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + daysAhead * 86400000).toISOString();

  const data = await googleApiFetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=${maxResults}&singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`,
    token,
  );

  const events = ((data.items as Array<Record<string, unknown>>) || []).map((ev) => {
    const start = ev.start as { dateTime?: string; date?: string } | undefined;
    const end = ev.end as { dateTime?: string; date?: string } | undefined;
    return {
      id: ev.id,
      summary: ev.summary,
      start: start?.dateTime || start?.date,
      end: end?.dateTime || end?.date,
      location: ev.location,
      htmlLink: ev.htmlLink,
      status: ev.status,
    };
  });

  return { status: "success", count: events.length, events };
}

async function driveSearchFiles(
  token: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const query = typeof args.query === "string" ? args.query.trim() : "";
  if (!query) return { error: "query is required" };

  const maxResults = clampInt(args.maxResults, 1, 20, 10);
  const driveQuery = query.includes("=")
    ? query
    : `fullText contains '${query.replace(/'/g, "\\'")}' and trashed = false`;

  const data = await googleApiFetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(driveQuery)}&pageSize=${maxResults}&fields=files(id,name,mimeType,modifiedTime,webViewLink)&orderBy=modifiedTime desc`,
    token,
  );

  const files = ((data.files as Array<Record<string, unknown>>) || []).map((f) => ({
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    modifiedTime: f.modifiedTime,
    webViewLink: f.webViewLink,
  }));

  return { status: "success", count: files.length, query, files };
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? Math.floor(value) : fallback;
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function decodeBase64Url(data: string): string {
  const padded = data.replace(/-/g, "+").replace(/_/g, "/");
  try {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}

function extractEmailBody(
  payload: {
    body?: { data?: string };
    parts?: Array<{ mimeType?: string; body?: { data?: string }; parts?: unknown[] }>;
  } | undefined,
): string {
  if (!payload) return "";

  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  const parts = payload.parts || [];
  const plain = parts.find((p) => p.mimeType === "text/plain");
  if (plain?.body?.data) return decodeBase64Url(plain.body.data);

  const html = parts.find((p) => p.mimeType === "text/html");
  if (html?.body?.data) {
    const raw = decodeBase64Url(html.body.data);
    return raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }

  for (const part of parts) {
    if (part.parts?.length) {
      const nested = extractEmailBody(part as typeof payload);
      if (nested) return nested;
    }
  }

  return "";
}

/** Used by describeConnectionsForPrompt to mention Google API access. */
export function hasGoogleConnection(connections: AgentConnection[]): boolean {
  return connections.some((c) => c.provider === "google" && !!c.access_token);
}

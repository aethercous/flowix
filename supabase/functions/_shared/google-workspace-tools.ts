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
  return googleApiRequest(url, token);
}

async function googleApiRequest(
  url: string,
  token: string,
  options: {
    method?: string;
    body?: Record<string, unknown>;
  } = {},
): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 600);
    throw new Error(`Google API ${res.status}: ${detail}`);
  }
  if (res.status === 204) return {};
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

export function buildGoogleWorkspaceToolDefinitions(canSendEdit = false): ToolDefinition[] {
  const tools: ToolDefinition[] = [
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

  if (canSendEdit) {
    tools.push(
      {
        name: "calendar_create_event",
        description:
          "Create a Google Calendar event or reminder on the user's primary calendar. Only available when the agent has send/edit permission. Use this when the user asks to add a calendar reminder, meeting, or event.",
        parameters: {
          type: "object",
          properties: {
            summary: { type: "string", description: "Event title, e.g. 'meeting with Rachel'." },
            startDateTime: {
              type: "string",
              description: "Event start as an ISO 8601 date-time, e.g. 2026-06-29T14:00:00-04:00.",
            },
            endDateTime: {
              type: "string",
              description: "Optional event end as an ISO 8601 date-time. Defaults to 30 minutes after start.",
            },
            timeZone: {
              type: "string",
              description: "Optional IANA timezone, e.g. America/New_York.",
            },
            description: { type: "string", description: "Optional event notes." },
            reminderMinutes: {
              type: "number",
              description: "Optional popup reminder minutes before start. Default 10.",
            },
            calendarId: {
              type: "string",
              description: "Optional calendar id. Defaults to primary.",
            },
          },
          required: ["summary", "startDateTime"],
        },
      },
      {
        name: "calendar_update_event",
        description:
          "Update an existing Google Calendar event. Only available when the agent has send/edit permission.",
        parameters: {
          type: "object",
          properties: {
            eventId: { type: "string", description: "Google Calendar event id." },
            summary: { type: "string", description: "Optional updated title." },
            startDateTime: { type: "string", description: "Optional updated start ISO date-time." },
            endDateTime: { type: "string", description: "Optional updated end ISO date-time." },
            timeZone: { type: "string", description: "Optional IANA timezone." },
            description: { type: "string", description: "Optional updated notes." },
            reminderMinutes: { type: "number", description: "Optional popup reminder minutes before start." },
            calendarId: { type: "string", description: "Optional calendar id. Defaults to primary." },
          },
          required: ["eventId"],
        },
      },
      {
        name: "calendar_delete_event",
        description:
          "Delete an existing Google Calendar event. Only available when the agent has send/edit permission.",
        parameters: {
          type: "object",
          properties: {
            eventId: { type: "string", description: "Google Calendar event id." },
            calendarId: { type: "string", description: "Optional calendar id. Defaults to primary." },
          },
          required: ["eventId"],
        },
      },
      {
        name: "gmail_send_message",
        description:
          "Send an email from the connected Gmail account. Only available when the agent has send/edit permission and the Google connection includes the gmail.send scope.",
        parameters: {
          type: "object",
          properties: {
            to: { type: "string", description: "Recipient email address." },
            subject: { type: "string", description: "Email subject." },
            body: { type: "string", description: "Plain-text email body." },
            cc: { type: "string", description: "Optional comma-separated CC recipients." },
            bcc: { type: "string", description: "Optional comma-separated BCC recipients." },
          },
          required: ["to", "subject", "body"],
        },
      },
    );
  }

  return tools;
}

export function googleWorkspaceSystemPromptBlock(hasGoogle: boolean, canSendEdit = false): string {
  if (!hasGoogle) {
    return "\n\nGoogle Workspace: NOT connected for this agent. If the user asks about Gmail, Calendar, or Drive, tell them to connect Google Workspace under Dashboard → Connections and enable it for this agent. Do NOT invent or guess email contents.";
  }
  const writeTools = canSendEdit
    ? " Because this agent has send/edit permission, you may also use calendar_create_event, calendar_update_event, calendar_delete_event, and gmail_send_message when the user asks you to make those changes."
    : " This agent is read-only, so you must not create, update, delete, or send Google Workspace items.";
  return `\n\nGoogle Workspace API: CONNECTED. You have gmail_list_messages, gmail_search, gmail_get_message, calendar_list_events, and drive_search_files tools that return live data from the user's Google account.${writeTools}

CRITICAL — never fabricate email or calendar data:
- When asked about emails, calendar events, or Drive files, you MUST call the appropriate Google Workspace tool first and base your answer only on the tool results.
- When asked to create, update, delete, or send Google Workspace items, only do so if the matching write tool is available. If the tool returns a permission/scope error, tell the user to reconnect Google Workspace with the updated permissions.
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
      case "calendar_create_event":
        return await calendarCreateEvent(auth.token, args, ctx);
      case "calendar_update_event":
        return await calendarUpdateEvent(auth.token, args, ctx);
      case "calendar_delete_event":
        return await calendarDeleteEvent(auth.token, args, ctx);
      case "gmail_send_message":
        return await gmailSendMessage(auth.token, args, ctx);
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

async function calendarCreateEvent(
  token: string,
  args: Record<string, unknown>,
  ctx: BrowserRuntimeContext,
): Promise<Record<string, unknown>> {
  if (!ctx.perms.can_send_edit) return writePermissionError();

  const summary = stringArg(args.summary);
  const startDateTime = stringArg(args.startDateTime);
  if (!summary || !startDateTime) return { error: "summary and startDateTime are required" };

  const calendarId = encodeURIComponent(stringArg(args.calendarId) || "primary");
  const body = buildCalendarEventBody(args);
  const data = await googleApiRequest(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`,
    token,
    { method: "POST", body },
  );

  return {
    status: "success",
    event: summarizeCalendarEvent(data),
    message: `Created calendar event: ${data.summary || summary}`,
  };
}

async function calendarUpdateEvent(
  token: string,
  args: Record<string, unknown>,
  ctx: BrowserRuntimeContext,
): Promise<Record<string, unknown>> {
  if (!ctx.perms.can_send_edit) return writePermissionError();

  const eventId = stringArg(args.eventId);
  if (!eventId) return { error: "eventId is required" };

  const calendarId = encodeURIComponent(stringArg(args.calendarId) || "primary");
  const body = buildCalendarEventBody(args, true);
  const data = await googleApiRequest(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${encodeURIComponent(eventId)}`,
    token,
    { method: "PATCH", body },
  );

  return {
    status: "success",
    event: summarizeCalendarEvent(data),
    message: `Updated calendar event: ${data.summary || eventId}`,
  };
}

async function calendarDeleteEvent(
  token: string,
  args: Record<string, unknown>,
  ctx: BrowserRuntimeContext,
): Promise<Record<string, unknown>> {
  if (!ctx.perms.can_send_edit) return writePermissionError();

  const eventId = stringArg(args.eventId);
  if (!eventId) return { error: "eventId is required" };

  const calendarId = encodeURIComponent(stringArg(args.calendarId) || "primary");
  await googleApiRequest(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${encodeURIComponent(eventId)}`,
    token,
    { method: "DELETE" },
  );

  return { status: "success", eventId, message: "Deleted calendar event" };
}

async function gmailSendMessage(
  token: string,
  args: Record<string, unknown>,
  ctx: BrowserRuntimeContext,
): Promise<Record<string, unknown>> {
  if (!ctx.perms.can_send_edit) return writePermissionError();

  const to = stringArg(args.to);
  const subject = stringArg(args.subject);
  const body = stringArg(args.body);
  if (!to || !subject || !body) return { error: "to, subject, and body are required" };

  const headers = [
    `To: ${to}`,
    stringArg(args.cc) ? `Cc: ${stringArg(args.cc)}` : "",
    stringArg(args.bcc) ? `Bcc: ${stringArg(args.bcc)}` : "",
    `Subject: ${subject}`,
    "Content-Type: text/plain; charset=UTF-8",
  ].filter(Boolean);
  const raw = base64UrlEncode(`${headers.join("\r\n")}\r\n\r\n${body}`);
  const data = await googleApiRequest(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    token,
    { method: "POST", body: { raw } },
  );

  return {
    status: "success",
    id: data.id,
    threadId: data.threadId,
    labelIds: data.labelIds,
    message: `Sent email to ${to}`,
  };
}

function buildCalendarEventBody(
  args: Record<string, unknown>,
  partial = false,
): Record<string, unknown> {
  const timeZone = stringArg(args.timeZone);
  const startDateTime = stringArg(args.startDateTime);
  const endDateTime = stringArg(args.endDateTime) ||
    (startDateTime ? new Date(Date.parse(startDateTime) + 30 * 60_000).toISOString() : "");

  const body: Record<string, unknown> = {};
  const summary = stringArg(args.summary);
  const description = stringArg(args.description);
  if (summary) body.summary = summary;
  if (description) body.description = description;
  if (startDateTime) body.start = { dateTime: startDateTime, ...(timeZone ? { timeZone } : {}) };
  if (endDateTime) body.end = { dateTime: endDateTime, ...(timeZone ? { timeZone } : {}) };

  const reminderMinutes = typeof args.reminderMinutes === "number"
    ? Math.max(0, Math.floor(args.reminderMinutes))
    : (partial ? undefined : 10);
  if (typeof reminderMinutes === "number") {
    body.reminders = {
      useDefault: false,
      overrides: [{ method: "popup", minutes: reminderMinutes }],
    };
  }

  return body;
}

function summarizeCalendarEvent(ev: Record<string, unknown>): Record<string, unknown> {
  const start = ev.start as { dateTime?: string; date?: string } | undefined;
  const end = ev.end as { dateTime?: string; date?: string } | undefined;
  return {
    id: ev.id,
    summary: ev.summary,
    start: start?.dateTime || start?.date,
    end: end?.dateTime || end?.date,
    htmlLink: ev.htmlLink,
    status: ev.status,
  };
}

function writePermissionError(): Record<string, unknown> {
  return {
    error: "This agent is read-only for Google Workspace. Enable send/edit permission in the agent configuration to create, update, delete, or send items.",
  };
}

function stringArg(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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

function base64UrlEncode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
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

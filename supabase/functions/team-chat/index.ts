import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";

// Supabase Edge runtime: lets us keep the worker alive for the AI reply after
// the HTTP response has already been returned to the sender.
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

type ChatAction = "send" | "history" | "presence";

interface ChatRequest {
  action: ChatAction;
  message?: string;
  before?: string;
  after?: string;
  limit?: number;
}

interface TeamMember {
  id: string;
  access_code_id: string;
  first_name: string;
  last_name: string;
  nickname: string | null;
  is_active: boolean;
}

const MSG_SELECT = "id, member_id, sender_name, body, created_at, is_ai";

// Matches a leading mention of the AI: "@ai ...", "@worlo ...", "@assistant",
// "@agent", or a "/ai ..." slash command. Case-insensitive.
const AI_TRIGGER = /^\s*(?:@(?:ai|worlo|assistant|agent)|\/ai)\b[:,]?\s*/i;

function isAiMention(text: string): boolean {
  return AI_TRIGGER.test(text);
}

function stripAiTrigger(text: string): string {
  return text.replace(AI_TRIGGER, "").trim();
}

function displayName(m: Pick<TeamMember, "first_name" | "last_name" | "nickname">): string {
  if (m.nickname?.trim()) return m.nickname.trim();
  return `${m.first_name} ${m.last_name}`.trim();
}

async function resolveMember(
  supabase: ReturnType<typeof createClient>,
  memberToken: string,
): Promise<{ member: TeamMember; error?: string; status?: number }> {
  const { data: member, error } = await supabase
    .from("team_members")
    .select("id, access_code_id, first_name, last_name, nickname, is_active")
    .eq("member_token", memberToken)
    .maybeSingle<TeamMember>();

  if (error) {
    console.error("team-chat member lookup:", error);
    return { member: null as unknown as TeamMember, error: "Authentication failed", status: 500 };
  }
  if (!member) {
    return { member: null as unknown as TeamMember, error: "Invalid session", status: 401 };
  }
  if (!member.is_active) {
    return { member, error: "You have been removed from this team", status: 403 };
  }

  const { data: code } = await supabase
    .from("access_codes")
    .select("id, is_active, expires_at")
    .eq("id", member.access_code_id)
    .maybeSingle();

  if (!code?.is_active) {
    return { member, error: "This invite code is no longer active", status: 403 };
  }
  if (new Date(code.expires_at) < new Date()) {
    return { member, error: "This invite code has expired", status: 403 };
  }

  return { member };
}

async function broadcastMessage(
  supabase: ReturnType<typeof createClient>,
  accessCodeId: string,
  payload: Record<string, unknown>,
) {
  const channel = supabase.channel(`team:${accessCodeId}`);
  await new Promise<void>((resolve) => {
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        channel.send({
          type: "broadcast",
          event: "message",
          payload,
        }).finally(() => {
          supabase.removeChannel(channel);
          resolve();
        });
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        supabase.removeChannel(channel);
        resolve();
      }
    });
  });
}

/** Look up the AI agent (api key + display name) tied to an invite code. */
async function getAgentForCode(
  supabase: ReturnType<typeof createClient>,
  accessCodeId: string,
): Promise<{ apiKey: string; agentName: string } | null> {
  const { data: code } = await supabase
    .from("access_codes")
    .select("agent_id, agent_token_id")
    .eq("id", accessCodeId)
    .maybeSingle();
  if (!code?.agent_token_id) return null;

  const { data: token } = await supabase
    .from("agent_tokens")
    .select("api_key, agent_config")
    .eq("id", code.agent_token_id)
    .maybeSingle();
  if (!token?.api_key) return null;

  let agentName = (token.agent_config?.agentName as string) || "Assistant";
  if (code.agent_id) {
    const { data: agentRow } = await supabase
      .from("agents")
      .select("name")
      .eq("id", code.agent_id)
      .maybeSingle();
    if (agentRow?.name) agentName = agentRow.name as string;
  }

  return { apiKey: token.api_key as string, agentName };
}

/** Build a compact conversation history for the AI from recent group messages. */
async function recentHistory(
  supabase: ReturnType<typeof createClient>,
  accessCodeId: string,
): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  const { data } = await supabase
    .from("team_messages")
    .select("sender_name, body, is_ai")
    .eq("access_code_id", accessCodeId)
    .order("created_at", { ascending: false })
    .limit(12);
  const rows = (data || []).reverse();
  return rows.map((r) => (
    r.is_ai
      ? { role: "assistant" as const, content: String(r.body) }
      : { role: "user" as const, content: `${r.sender_name}: ${r.body}` }
  ));
}

/** Invoke the agent and post its reply back into the group chat. */
async function runAiReply(
  supabase: ReturnType<typeof createClient>,
  accessCodeId: string,
  askerName: string,
  prompt: string,
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<void> {
  try {
    const agent = await getAgentForCode(supabase, accessCodeId);
    if (!agent) return;

    const history = await recentHistory(supabase, accessCodeId);
    const question = prompt || "Hello";

    let reply = "";
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/agent-invoke`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "X-Agent-Key": agent.apiKey,
        },
        body: JSON.stringify({
          message: `${askerName} asked the team's AI: ${question}`,
          history: history.slice(0, -1).slice(-10),
          timeZone: "UTC",
        }),
      });
      const data = await res.json().catch(() => null);
      reply = (data && (data.reply as string)) ||
        "Sorry, I couldn't generate a response just now.";
    } catch (e) {
      console.error("team-chat agent-invoke:", e);
      reply = "Sorry, the assistant is unavailable right now.";
    }

    const { data: row } = await supabase
      .from("team_messages")
      .insert({
        access_code_id: accessCodeId,
        member_id: null,
        sender_name: agent.agentName,
        body: reply,
        is_ai: true,
      })
      .select(MSG_SELECT)
      .single();

    if (row) await broadcastMessage(supabase, accessCodeId, row);
  } catch (e) {
    console.error("team-chat runAiReply:", e);
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const memberToken = req.headers.get("x-member-token") || req.headers.get("X-Member-Token");
  if (!memberToken) return jsonResponse({ error: "Member token required" }, 401);

  let body: ChatRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { action } = body;
  if (!action) return jsonResponse({ error: "action is required" }, 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Server configuration error" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });

  const resolved = await resolveMember(supabase, memberToken);
  if (resolved.error) {
    return jsonResponse({ error: resolved.error }, resolved.status || 401);
  }
  const member = resolved.member;

  try {
    if (action === "presence") {
      await supabase
        .from("team_members")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", member.id);
      return jsonResponse({ success: true });
    }

    if (action === "history") {
      const limit = Math.min(Math.max(body.limit || 50, 1), 100);

      // "after" = poll for newer messages (ascending, no reverse needed)
      if (body.after) {
        const { data, error } = await supabase
          .from("team_messages")
          .select(MSG_SELECT)
          .eq("access_code_id", member.access_code_id)
          .gt("created_at", body.after)
          .order("created_at", { ascending: true })
          .limit(limit);
        if (error) return jsonResponse({ error: "Failed to load messages" }, 500);
        return jsonResponse({ success: true, messages: data || [] });
      }

      let query = supabase
        .from("team_messages")
        .select(MSG_SELECT)
        .eq("access_code_id", member.access_code_id)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (body.before) {
        query = query.lt("created_at", body.before);
      }

      const { data, error } = await query;
      if (error) return jsonResponse({ error: "Failed to load messages" }, 500);

      const messages = (data || []).reverse();
      return jsonResponse({ success: true, messages });
    }

    if (action === "send") {
      const text = (body.message || "").trim();
      if (!text) return jsonResponse({ error: "Message is required" }, 400);
      if (text.length > 4000) return jsonResponse({ error: "Message too long" }, 400);

      const senderName = displayName(member);
      const { data: row, error } = await supabase
        .from("team_messages")
        .insert({
          access_code_id: member.access_code_id,
          member_id: member.id,
          sender_name: senderName,
          body: text,
          is_ai: false,
        })
        .select(MSG_SELECT)
        .single();

      if (error || !row) {
        console.error("team-chat insert:", error);
        return jsonResponse({ error: "Failed to send message" }, 500);
      }

      await supabase
        .from("team_members")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", member.id);

      await broadcastMessage(supabase, member.access_code_id, row);

      // If the message mentions the AI, generate a reply in the background so the
      // sender's HTTP request returns immediately. Everyone (including the
      // sender) picks up the reply via realtime broadcast + polling.
      const aiRequested = isAiMention(text);
      if (aiRequested) {
        const prompt = stripAiTrigger(text);
        const job = runAiReply(
          supabase,
          member.access_code_id,
          senderName,
          prompt,
          supabaseUrl,
          serviceRoleKey,
        );
        if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
          EdgeRuntime.waitUntil(job);
        } else {
          // Fallback: best-effort, don't block the response for too long.
          job.catch((e) => console.error("team-chat ai job:", e));
        }
      }

      return jsonResponse({ success: true, message: row, aiRequested });
    }

    return jsonResponse({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("team-chat:", e);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});

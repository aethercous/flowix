import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";

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
          .select("id, member_id, sender_name, body, created_at")
          .eq("access_code_id", member.access_code_id)
          .gt("created_at", body.after)
          .order("created_at", { ascending: true })
          .limit(limit);
        if (error) return jsonResponse({ error: "Failed to load messages" }, 500);
        return jsonResponse({ success: true, messages: data || [] });
      }

      let query = supabase
        .from("team_messages")
        .select("id, member_id, sender_name, body, created_at")
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
        })
        .select("id, member_id, sender_name, body, created_at")
        .single();

      if (error || !row) {
        console.error("team-chat insert:", error);
        return jsonResponse({ error: "Failed to send message" }, 500);
      }

      await supabase
        .from("team_members")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", member.id);

      const payload = {
        id: row.id,
        member_id: row.member_id,
        sender_name: row.sender_name,
        body: row.body,
        created_at: row.created_at,
      };

      await broadcastMessage(supabase, member.access_code_id, payload);

      return jsonResponse({ success: true, message: payload });
    }

    return jsonResponse({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("team-chat:", e);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";

type MembersAction = "list";

interface MembersRequest {
  action: MembersAction;
}

interface TeamMemberRow {
  id: string;
  first_name: string;
  last_name: string;
  nickname: string | null;
  is_active: boolean;
  joined_at: string;
  last_seen_at: string | null;
}

function displayName(m: Pick<TeamMemberRow, "first_name" | "last_name" | "nickname">): string {
  if (m.nickname?.trim()) return m.nickname.trim();
  return `${m.first_name} ${m.last_name}`.trim();
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const memberToken = req.headers.get("x-member-token") || req.headers.get("X-Member-Token");
  if (!memberToken) return jsonResponse({ error: "Member token required" }, 401);

  let body: MembersRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  if (body.action !== "list") return jsonResponse({ error: "Unknown action" }, 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Server configuration error" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });

  const { data: self, error: selfErr } = await supabase
    .from("team_members")
    .select("id, access_code_id, is_active")
    .eq("member_token", memberToken)
    .maybeSingle();

  if (selfErr || !self) return jsonResponse({ error: "Invalid session" }, 401);
  if (!self.is_active) return jsonResponse({ error: "You have been removed from this team" }, 403);

  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const { data: members, error } = await supabase
    .from("team_members")
    .select("id, first_name, last_name, nickname, is_active, joined_at, last_seen_at")
    .eq("access_code_id", self.access_code_id)
    .eq("is_active", true)
    .order("joined_at", { ascending: true });

  if (error) return jsonResponse({ error: "Failed to load members" }, 500);

  const roster = (members || []).map((m: TeamMemberRow) => ({
    id: m.id,
    displayName: displayName(m),
    firstName: m.first_name,
    lastName: m.last_name,
    nickname: m.nickname,
    joinedAt: m.joined_at,
    online: !!(m.last_seen_at && m.last_seen_at >= fiveMinAgo),
    isYou: m.id === self.id,
  }));

  return jsonResponse({ success: true, members: roster });
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Missing Authorization header" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return jsonResponse({ error: "Unauthorized" }, 401);

  let provider: string | undefined;
  let connectionId: string | undefined;

  try {
    const body = await req.json();
    provider = body.provider;
    connectionId = body.connectionId;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  if (!provider && !connectionId) {
    return jsonResponse({ error: "provider or connectionId required" }, 400);
  }

  let query = supabase.from("user_connections").select("id").eq("user_id", user.id);
  if (connectionId) query = query.eq("id", connectionId);
  else if (provider) query = query.eq("provider", provider);

  const { data: rows, error: fetchErr } = await query;
  if (fetchErr) return jsonResponse({ error: fetchErr.message }, 500);
  if (!rows?.length) return jsonResponse({ ok: true, removed: 0 });

  const ids = rows.map((r) => r.id);

  await supabase.from("agent_connections").delete().in("user_connection_id", ids);
  const { error: delErr } = await supabase.from("user_connections").delete().in("id", ids);
  if (delErr) return jsonResponse({ error: delErr.message }, 500);

  return jsonResponse({ ok: true, removed: ids.length });
});

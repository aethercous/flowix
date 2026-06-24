/**
 * Link a provider using tokens already on the user's Supabase Auth session
 * (e.g. Google sign-in). Avoids a second OAuth app when Auth already has scopes.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";
import { ensureContextForUserConnection } from "../_shared/browserbase-contexts.ts";
import { GOOGLE_WORKSPACE_SCOPES } from "../_shared/oauth-providers.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Missing Authorization header" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return jsonResponse({ error: "Unauthorized" }, 401);

  const { data: { session }, error: sessErr } = await userClient.auth.getSession();
  if (sessErr || !session) return jsonResponse({ error: "No active session" }, 401);

  let provider = "google";
  try {
    const body = await req.json();
    if (body?.provider) provider = String(body.provider);
  } catch {
    /* default google */
  }

  if (provider !== "google") {
    return jsonResponse({ error: "Session linking is only supported for Google" }, 400);
  }

  const accessToken = session.provider_token;
  if (!accessToken) {
    return jsonResponse({
      ok: false,
      needsConsent: true,
      error: "Approve Google Workspace access to connect Gmail, Drive, and Docs.",
    });
  }

  const googleIdentity = (user.identities ?? []).find((i) => i.provider === "google");
  const externalId = googleIdentity?.id ?? user.email ?? "default";
  const label = user.user_metadata?.full_name
    ? `${user.user_metadata.full_name} (Google Workspace)`
    : user.email
    ? `${user.email} (Google Workspace)`
    : "Google Workspace";

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });

  const refreshToken = session.provider_refresh_token ?? null;
  const expiresAt = session.expires_at
    ? new Date(session.expires_at * 1000).toISOString()
    : null;

  const { data: conn, error: connErr } = await admin
    .from("user_connections")
    .upsert({
      user_id: user.id,
      provider: "google",
      external_account_id: externalId,
      account_label: label,
      access_token: accessToken,
      refresh_token: refreshToken,
      token_expires_at: expiresAt,
      scopes: GOOGLE_WORKSPACE_SCOPES,
      metadata: { linked_from: "auth_session" },
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,provider,external_account_id" })
    .select("id")
    .single();

  if (connErr || !conn) {
    return jsonResponse({ error: connErr?.message || "Failed to save connection" }, 500);
  }

  try {
    await ensureContextForUserConnection(admin, conn.id, null);
  } catch (e) {
    console.warn("Browserbase context:", e);
  }

  return jsonResponse({ ok: true, provider: "google", connectionId: conn.id });
});

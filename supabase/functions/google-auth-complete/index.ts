import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";
import { ensureContextForUserConnection } from "../_shared/browserbase-contexts.ts";
import { GOOGLE_WORKSPACE_SCOPES } from "../_shared/oauth-providers.ts";
import {
  exchangeGoogleCode,
  verifyGoogleAuthState,
} from "../_shared/google-oauth-branded.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  let code = "";
  let state = "";

  try {
    const body = await req.json();
    code = String(body?.code || "");
    state = String(body?.state || "");
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  if (!code || !state) {
    return jsonResponse({ error: "Missing code or state" }, 400);
  }

  const payload = await verifyGoogleAuthState(state);
  if (!payload) {
    return jsonResponse({ error: "Invalid or expired OAuth state" }, 400);
  }

  try {
    const tokenData = await exchangeGoogleCode(code, payload.redirectUri);
    const accessToken = String(tokenData.access_token || "");
    const idToken = tokenData.id_token ? String(tokenData.id_token) : null;
    const refreshToken = tokenData.refresh_token ? String(tokenData.refresh_token) : null;
    const expiresIn = tokenData.expires_in ? Number(tokenData.expires_in) : null;
    const tokenExpiresAt = expiresIn
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : null;

    if (payload.mode === "signin") {
      if (!idToken) throw new Error("Google did not return an ID token");
      return jsonResponse({
        ok: true,
        mode: "signin",
        idToken,
        returnUrl: payload.returnUrl,
      });
    }

    if (!payload.userId) {
      return jsonResponse({ error: "Connect flow requires a signed-in user" }, 401);
    }
    if (!accessToken) throw new Error("Google did not return an access token");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });

    const { data: userRes } = await admin.auth.admin.getUserById(payload.userId);
    const user = userRes?.user;
    const googleIdentity = user?.identities?.find((i) => i.provider === "google");
    const externalId = googleIdentity?.id ?? user?.email ?? "default";
    const label = user?.user_metadata?.full_name
      ? `${user.user_metadata.full_name} (Google Workspace)`
      : user?.email
      ? `${user.email} (Google Workspace)`
      : "Google Workspace";

    const { data: conn, error: connErr } = await admin
      .from("user_connections")
      .upsert({
        user_id: payload.userId,
        provider: "google",
        external_account_id: externalId,
        account_label: label,
        access_token: accessToken,
        refresh_token: refreshToken,
        token_expires_at: tokenExpiresAt,
        scopes: GOOGLE_WORKSPACE_SCOPES,
        metadata: { linked_from: "branded_google_oauth" },
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,provider,external_account_id" })
      .select("id")
      .single();

    if (connErr || !conn) {
      throw new Error(connErr?.message || "Failed to save Google connection");
    }

    try {
      await ensureContextForUserConnection(admin, conn.id, null);
    } catch (e) {
      console.warn("Browserbase context:", e);
    }

    return jsonResponse({
      ok: true,
      mode: "connect",
      provider: "google",
      connectionId: conn.id,
      returnUrl: payload.returnUrl,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Google authorization failed";
    return jsonResponse({ error: msg }, 400);
  }
});

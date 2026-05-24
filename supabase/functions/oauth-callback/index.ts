import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCallbackUrl, getProvider } from "../_shared/oauth-providers.ts";

function redirectHtml(target: string, message: string): Response {
  const safeTarget = target.replace(/"/g, "%22");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Connecting…</title></head>
<body><p>${message}</p><script>window.location.replace("${safeTarget}");</script></body></html>`;
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

/** Put query params before the hash so dashboard can read window.location.search */
function appendQuery(returnUrl: string, params: Record<string, string>): string {
  const hashIdx = returnUrl.indexOf("#");
  const beforeHash = hashIdx >= 0 ? returnUrl.slice(0, hashIdx) : returnUrl;
  const hash = hashIdx >= 0 ? returnUrl.slice(hashIdx) : "";
  const qIdx = beforeHash.indexOf("?");
  const path = qIdx >= 0 ? beforeHash.slice(0, qIdx) : beforeHash;
  const sp = new URLSearchParams(qIdx >= 0 ? beforeHash.slice(qIdx + 1) : "");
  for (const [k, v] of Object.entries(params)) sp.set(k, v);
  const qs = sp.toString();
  return path + (qs ? `?${qs}` : "") + hash;
}

function errorRedirect(returnUrl: string, err: string): Response {
  const final = appendQuery(returnUrl, { oauth: "error", message: err });
  return redirectHtml(final, `Connection failed: ${err}`);
}

async function exchangeToken(
  provider: ReturnType<typeof getProvider>,
  code: string,
  redirectUri: string,
): Promise<Record<string, unknown>> {
  const clientId = Deno.env.get(provider!.clientIdEnv)!;
  const clientSecret = Deno.env.get(provider!.clientSecretEnv)!;

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };

  if (provider!.id === "github") {
    headers.Accept = "application/json";
  }

  const res = await fetch(provider!.tokenUrl, { method: "POST", headers, body });
  const text = await res.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text);
  } catch {
    if (provider!.id === "github" && text.includes("access_token=")) {
      const params = new URLSearchParams(text);
      data = { access_token: params.get("access_token"), token_type: params.get("token_type") };
    } else {
      throw new Error(`Token exchange failed: ${text.slice(0, 200)}`);
    }
  }

  if (!res.ok && !data.access_token) {
    throw new Error((data.error as string) || (data.error_description as string) || "Token exchange failed");
  }
  return data;
}

function accountLabel(provider: string, tokenData: Record<string, unknown>): string {
  if (provider === "slack" && tokenData.team) {
    const team = tokenData.team as { name?: string };
    return team.name || "Slack workspace";
  }
  if (provider === "github" && tokenData.scope) return "GitHub account";
  if (provider === "notion" && tokenData.workspace_name) {
    return String(tokenData.workspace_name);
  }
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

function externalId(provider: string, tokenData: Record<string, unknown>): string {
  if (provider === "slack" && tokenData.team) {
    const team = tokenData.team as { id?: string };
    return team.id || "default";
  }
  if (provider === "notion" && tokenData.workspace_id) {
    return String(tokenData.workspace_id);
  }
  if (tokenData.authed_user && typeof tokenData.authed_user === "object") {
    const u = tokenData.authed_user as { id?: string };
    if (u.id) return u.id;
  }
  return "default";
}

serve(async (req: Request) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateId = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  if (!stateId) {
    return new Response("Missing state", { status: 400 });
  }

  const { data: stateRow, error: stateErr } = await admin
    .from("oauth_states")
    .select("*")
    .eq("id", stateId)
    .maybeSingle();

  const returnUrl = stateRow?.return_url || "dashboard.html#connections";

  if (stateErr || !stateRow) {
    return errorRedirect(returnUrl, "Invalid or expired OAuth session");
  }

  if (new Date(stateRow.expires_at) < new Date()) {
    await admin.from("oauth_states").delete().eq("id", stateId);
    return errorRedirect(returnUrl, "OAuth session expired. Please try again.");
  }

  if (oauthError) {
    await admin.from("oauth_states").delete().eq("id", stateId);
    return errorRedirect(returnUrl, oauthError);
  }

  if (!code) {
    return errorRedirect(returnUrl, "No authorization code received");
  }

  const config = getProvider(stateRow.provider);
  if (!config) {
    return errorRedirect(returnUrl, "Unknown provider");
  }

  try {
    const redirectUri = getCallbackUrl(supabaseUrl);
    const tokenData = await exchangeToken(config, code, redirectUri);

    const accessToken = String(tokenData.access_token || "");
    const refreshToken = tokenData.refresh_token ? String(tokenData.refresh_token) : null;
    const expiresIn = tokenData.expires_in ? Number(tokenData.expires_in) : null;
    const tokenExpiresAt = expiresIn
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : null;

    const { data: conn, error: connErr } = await admin
      .from("user_connections")
      .upsert({
        user_id: stateRow.user_id,
        provider: stateRow.provider,
        external_account_id: externalId(stateRow.provider, tokenData),
        account_label: accountLabel(stateRow.provider, tokenData),
        access_token: accessToken,
        refresh_token: refreshToken,
        token_expires_at: tokenExpiresAt,
        scopes: config.scopes,
        metadata: { raw: { ok: true, provider: stateRow.provider } },
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,provider,external_account_id" })
      .select("id")
      .single();

    if (connErr || !conn) {
      throw new Error(connErr?.message || "Failed to save connection");
    }

    if (stateRow.agent_id) {
      await admin.from("agent_connections").upsert({
        user_id: stateRow.user_id,
        agent_id: stateRow.agent_id,
        app_name: stateRow.provider,
        user_connection_id: conn.id,
        access_token: null,
        session_id: null,
      }, { onConflict: "agent_id,app_name" });
    }

    await admin.from("oauth_states").delete().eq("id", stateId);

    const successPath = appendQuery(returnUrl, {
      oauth: "success",
      provider: stateRow.provider,
    });

    return redirectHtml(successPath, "Connected! Redirecting…");
  } catch (e) {
    await admin.from("oauth_states").delete().eq("id", stateId);
    const msg = e instanceof Error ? e.message : "Connection failed";
    return errorRedirect(returnUrl, msg);
  }
});

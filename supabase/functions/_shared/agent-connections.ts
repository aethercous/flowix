/**
 * Loads OAuth/browser connections linked to an agent and refreshes the
 * stored access token if it has expired.
 *
 * All of this runs server-side with the service role, so the OAuth secrets
 * stay in Supabase and never touch the browser.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getProvider } from "./oauth-providers.ts";
import { getBrowserProvider } from "./connection-providers.ts";

export interface AgentConnection {
  user_connection_id: string;
  provider: string;
  account_label: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  scopes: string[] | null;
  browserbase_context_id: string | null;
}

interface UserConnectionRow {
  id: string;
  provider: string;
  account_label: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  scopes: string[] | null;
  browserbase_context_id: string | null;
}

/**
 * Returns the agent's linked OAuth connections (one per provider). Tokens are
 * refreshed lazily if they are within 60 seconds of expiry and a refresh
 * token is available.
 */
export async function loadAgentConnections(
  supabase: SupabaseClient,
  userId: string,
  agentId: string,
): Promise<AgentConnection[]> {
  const { data: linkRows, error: linkErr } = await supabase
    .from("agent_connections")
    .select("user_connection_id, app_name")
    .eq("user_id", userId)
    .eq("agent_id", agentId);

  if (linkErr) {
    console.warn("Failed to load agent_connections:", linkErr.message);
    return [];
  }

  const linkedIds = (linkRows ?? [])
    .map((r) => r.user_connection_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  if (!linkedIds.length) return [];

  const { data: ucRows, error: ucErr } = await supabase
    .from("user_connections")
    .select(
      "id, provider, account_label, access_token, refresh_token, token_expires_at, scopes, browserbase_context_id",
    )
    .eq("user_id", userId)
    .in("id", linkedIds);

  if (ucErr) {
    console.warn("Failed to load user_connections:", ucErr.message);
    return [];
  }

  const connections: AgentConnection[] = [];
  for (const uc of (ucRows ?? []) as UserConnectionRow[]) {
    if (!getBrowserProvider(uc.provider)) continue;

    let accessToken = uc.access_token;
    let expiresAt = uc.token_expires_at;

    if (shouldRefresh(expiresAt) && uc.refresh_token) {
      try {
        const refreshed = await refreshAccessToken(uc.provider, uc.refresh_token);
        if (refreshed) {
          accessToken = refreshed.access_token;
          expiresAt = refreshed.expires_at;
          await supabase
            .from("user_connections")
            .update({
              access_token: refreshed.access_token,
              token_expires_at: refreshed.expires_at,
              refresh_token: refreshed.refresh_token ?? uc.refresh_token,
              updated_at: new Date().toISOString(),
            })
            .eq("id", uc.id);
        }
      } catch (err) {
        console.warn(`Failed to refresh ${uc.provider} token:`, err);
      }
    }

    connections.push({
      user_connection_id: uc.id,
      provider: uc.provider,
      account_label: uc.account_label,
      access_token: accessToken,
      refresh_token: uc.refresh_token,
      token_expires_at: expiresAt,
      scopes: uc.scopes,
      browserbase_context_id: uc.browserbase_context_id,
    });
  }

  return connections;
}

function shouldRefresh(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false;
  const ts = Date.parse(expiresAt);
  if (Number.isNaN(ts)) return false;
  return ts - Date.now() < 60_000;
}

interface RefreshedToken {
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
}

async function refreshAccessToken(
  providerId: string,
  refreshToken: string,
): Promise<RefreshedToken | null> {
  const cfg = getProvider(providerId);
  if (!cfg) return null;

  const clientId = Deno.env.get(cfg.clientIdEnv);
  const clientSecret = Deno.env.get(cfg.clientSecretEnv);
  if (!clientId || !clientSecret) return null;

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  if (!res.ok) {
    console.warn(`Refresh failed for ${providerId}: ${await res.text()}`);
    return null;
  }

  const data = await res.json() as Record<string, unknown>;
  const accessToken = typeof data.access_token === "string" ? data.access_token : null;
  if (!accessToken) return null;

  const newRefresh = typeof data.refresh_token === "string" ? data.refresh_token : null;
  const expiresIn = typeof data.expires_in === "number" ? data.expires_in : null;
  const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;

  return { access_token: accessToken, refresh_token: newRefresh, expires_at: expiresAt };
}

/**
 * Google OAuth via the site domain (e.g. worlo.site) so Google shows your brand
 * instead of project-ref.supabase.co on the account chooser.
 */
import { GOOGLE_WORKSPACE_SCOPES, getProvider } from "./oauth-providers.ts";

const SIGNIN_SCOPES = ["openid", "email", "profile"];

const ALLOWED_REDIRECT_SUFFIX = "/auth/google-callback.html";

const ALLOWED_ORIGINS = new Set([
  "https://worlo.site",
  "http://localhost:8765",
  "http://127.0.0.1:8765",
]);

export type GoogleAuthMode = "signin" | "connect";

export interface GoogleAuthStatePayload {
  mode: GoogleAuthMode;
  returnUrl: string;
  redirectUri: string;
  userId?: string;
  exp: number;
  n: string;
}

function stateSecret(): string {
  return Deno.env.get("GOOGLE_OAUTH_STATE_SECRET") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    "";
}

function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function hmacSign(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return toBase64Url(new Uint8Array(sig));
}

export function isAllowedRedirectUri(redirectUri: string): boolean {
  try {
    const url = new URL(redirectUri);
    const origin = url.origin;
    if (!ALLOWED_ORIGINS.has(origin)) return false;
    return url.pathname === ALLOWED_REDIRECT_SUFFIX;
  } catch {
    return false;
  }
}

export async function createGoogleAuthState(
  payload: Omit<GoogleAuthStatePayload, "exp" | "n">,
): Promise<string> {
  const full: GoogleAuthStatePayload = {
    ...payload,
    exp: Date.now() + 10 * 60 * 1000,
    n: crypto.randomUUID(),
  };
  const body = toBase64Url(new TextEncoder().encode(JSON.stringify(full)));
  const sig = await hmacSign(body, stateSecret());
  return `${body}.${sig}`;
}

function fromBase64Url(str: string): Uint8Array {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export async function verifyGoogleAuthState(state: string): Promise<GoogleAuthStatePayload | null> {
  const secret = stateSecret();
  if (!secret) return null;
  const dot = state.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  const expected = await hmacSign(body, secret);
  if (sig !== expected) return null;
  try {
    const json = new TextDecoder().decode(fromBase64Url(body));
    const payload = JSON.parse(json) as GoogleAuthStatePayload;
    if (!payload.exp || Date.now() > payload.exp) return null;
    if (!isAllowedRedirectUri(payload.redirectUri)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function scopesForMode(mode: GoogleAuthMode): string[] {
  if (mode === "connect") return GOOGLE_WORKSPACE_SCOPES;
  return SIGNIN_SCOPES;
}

export function getGoogleClientCredentials(): { clientId: string; clientSecret: string } | null {
  const config = getProvider("google");
  if (!config) return null;
  const clientId = Deno.env.get(config.clientIdEnv);
  const clientSecret = Deno.env.get(config.clientSecretEnv);
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export async function exchangeGoogleCode(
  code: string,
  redirectUri: string,
): Promise<Record<string, unknown>> {
  const creds = getGoogleClientCredentials();
  if (!creds) throw new Error("Google OAuth is not configured");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const data = await res.json() as Record<string, unknown>;
  if (!res.ok && !data.access_token) {
    throw new Error(
      (data.error_description as string) || (data.error as string) || "Google token exchange failed",
    );
  }
  return data;
}

export function buildGoogleAuthorizeUrl(
  redirectUri: string,
  state: string,
  mode: GoogleAuthMode,
): string {
  const creds = getGoogleClientCredentials();
  if (!creds) throw new Error("Google OAuth is not configured");

  const params = new URLSearchParams({
    client_id: creds.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    state,
    scope: scopesForMode(mode).join(" "),
    access_type: "offline",
    prompt: "consent",
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

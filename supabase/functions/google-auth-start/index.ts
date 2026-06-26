import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";
import {
  buildGoogleAuthorizeUrl,
  createGoogleAuthState,
  isAllowedRedirectUri,
  type GoogleAuthMode,
} from "../_shared/google-oauth-branded.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  let mode: GoogleAuthMode = "signin";
  let redirectUri = "";
  let returnUrl = "/";

  try {
    const body = await req.json();
    if (body?.mode === "connect") mode = "connect";
    redirectUri = String(body?.redirectUri || "");
    if (body?.returnUrl) returnUrl = String(body.returnUrl);
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  if (!isAllowedRedirectUri(redirectUri)) {
    return jsonResponse({ error: "Invalid redirect URI" }, 400);
  }

  let userId: string | undefined;

  if (mode === "connect") {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Missing Authorization header" }, 401);
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return jsonResponse({ error: "Unauthorized" }, 401);
    userId = user.id;
  }

  try {
    const state = await createGoogleAuthState({
      mode,
      returnUrl,
      redirectUri,
      userId,
    });
    const url = buildGoogleAuthorizeUrl(redirectUri, state, mode);
    return jsonResponse({ url, mode });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to start Google OAuth";
    return jsonResponse({ ok: false, error: msg });
  }
});

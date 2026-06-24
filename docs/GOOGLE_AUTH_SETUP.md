# Google sign-in for worlo (Supabase Auth)

worlo uses **Supabase Auth** with `signInWithOAuth({ provider: 'google' })`.

**Production homepage:** https://flowix.space

Enable Google in your Supabase project before the buttons work in production or locally.

## 1. Google Cloud Console

1. Open [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials.
2. Create an **OAuth 2.0 Client ID** (Web application).
3. **OAuth consent screen** (no multi-day verification needed for basic login):
   - User type: **External**
   - Scopes: keep only **email**, **profile**, **openid** — do **not** add Calendar scopes here
   - **Testing:** add each sign-in email under **Test users** (up to 100), **or**
   - **Production:** click **Publish app** — basic email/profile scopes work immediately without Google verification
4. Add **Authorized JavaScript origins**:
   - `https://flowix.space`
   - `http://localhost:8765` (local preview)
4. Add **Authorized redirect URIs** (Supabase callback — required):
   - `https://utofnywijqsozjqmkhcn.supabase.co/auth/v1/callback`
5. Copy the **Client ID** and **Client secret**.

## 2. Supabase Dashboard

1. Project → **Authentication** → **Providers** → **Google**.
2. Enable Google and paste the Client ID and Client secret.
3. Under **Authentication** → **URL Configuration**:
   - **Site URL:** `https://flowix.space`
   - **Redirect URLs:**
     - `https://flowix.space`
     - `https://flowix.space/`
     - `http://localhost:8765`
     - `http://localhost:8765/`

## 3. Verify

1. Open https://flowix.space → **Sign in** → **Continue with Google**.
2. After approving Google, you should return signed in on the homepage.

Local preview: `python -m http.server 8765` from the repo root, then open http://localhost:8765/

## Notes

- **Sign-in uses only email/profile** — no Gmail/Drive scopes, so Google verification is not required for login alone.
- **Google Workspace connections** reuse this same OAuth client via Supabase Auth (no second Google app).
  - User clicks **Connect** on the Connections page → Google consent for Gmail, Drive, Docs, Calendar.
  - Redirect URI stays `https://utofnywijqsozjqmkhcn.supabase.co/auth/v1/callback` (not the edge-function callback).
- Optional: set `OAUTH_GOOGLE_CLIENT_ID` and `OAUTH_GOOGLE_CLIENT_SECRET` in Edge Function secrets to the **same** Client ID/secret (used only to refresh tokens during agent runs).
- Gmail/Drive scopes may require [Google app verification](https://support.google.com/cloud/answer/9110914) before public launch.
- `/neura_ui.html` redirects to `/` for backwards compatibility.

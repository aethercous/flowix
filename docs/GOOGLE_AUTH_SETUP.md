# Google sign-in for flowix (Supabase Auth)

flowix uses **Supabase Auth** with `signInWithOAuth({ provider: 'google' })`.

**Production homepage:** https://flowix.space

Enable Google in your Supabase project before the buttons work in production or locally.

## 1. Google Cloud Console

1. Open [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials.
2. Create an **OAuth 2.0 Client ID** (Web application).
3. Add **Authorized JavaScript origins**:
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

- Google sign-in is separate from **Google Calendar** OAuth used for agent connections (`OAUTH_GOOGLE_*` env vars in Edge Functions).
- `/neura_ui.html` redirects to `/` for backwards compatibility.

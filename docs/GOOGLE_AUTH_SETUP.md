# Google sign-in for flowix (Supabase Auth)

flowix uses **Supabase Auth** with `signInWithOAuth({ provider: 'google' })`.

**Status:** Google must be enabled in Supabase. If the API returns `Unsupported provider: provider is not enabled`, complete the steps below.

Enable Google in your Supabase project before the buttons work in production or locally.

## 1. Google Cloud Console

1. Open [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials.
2. Create an **OAuth 2.0 Client ID** (Web application).
3. Add **Authorized JavaScript origins**:
   - `http://localhost:8765` (local preview)
   - `https://your-production-domain.com`
4. Add **Authorized redirect URIs** (Supabase callback):
   - `https://utofnywijqsozjqmkhcn.supabase.co/auth/v1/callback`
5. Copy the **Client ID** and **Client secret**.

## 2. Supabase Dashboard

1. Project → **Authentication** → **Providers** → **Google**.
2. Enable Google and paste the Client ID and Client secret.
3. Under **Authentication** → **URL Configuration**, set **Site URL** to your production origin (e.g. `https://your-domain.com`).
4. Add **Redirect URLs** (where users return after OAuth):
   - `http://localhost:8765/neura_ui.html`
   - `https://your-production-domain.com/neura_ui.html`
   - Any other pages that call `FlowixAuth.init()` with Google sign-in.

## 3. Verify

1. Run local preview: `python -m http.server 8765` from the repo root.
2. Open `http://localhost:8765/neura_ui.html` → **Sign in** → **Continue with Google**.
3. After approving Google, you should return signed in on the landing page (or redirect to the dashboard if configured).

## Notes

- Google sign-in is separate from **Google Calendar** OAuth used for agent connections (`OAUTH_GOOGLE_*` env vars in Edge Functions).
- Users must accept the Terms of Service and Privacy Policy when signing up with email; the signup modal checkbox applies to email sign-up and Google sign-up when the signup modal is open.

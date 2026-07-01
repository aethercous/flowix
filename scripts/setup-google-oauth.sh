#!/usr/bin/env bash
# Interactive Google OAuth setup for worlo (sign-in + Connections page).
# Run from repo root: ./scripts/setup-google-oauth.sh

set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-worlo-500418}"
SUPABASE_REF="${SUPABASE_PROJECT_REF:-utofnywijqsozjqmkhcn}"
SITE="https://worlo.site"
SUPABASE_CALLBACK="https://${SUPABASE_REF}.supabase.co/auth/v1/callback"

echo ""
echo "=== worlo Google OAuth setup (project: ${PROJECT_ID}) ==="
echo ""
echo "STEP 1 — OAuth consent screen"
echo "  Open: https://console.cloud.google.com/auth/overview?project=${PROJECT_ID}"
echo "  • User type: External"
echo "  • App name: Flowix (or worlo)"
echo "  • User support email: your email"
echo "  • Authorized domains: worlo.site"
echo "  • Home page: ${SITE}"
echo "  • Privacy: ${SITE}/privacy-policy.html"
echo "  • Terms: ${SITE}/terms-of-service.html"
echo ""
echo "STEP 2 — Add scopes (Data Access → Add or remove scopes)"
echo "  Non-sensitive:"
echo "    • .../auth/userinfo.email"
echo "    • .../auth/userinfo.profile"
echo "    • openid"
echo "  Sensitive / restricted (Connections — Gmail, Drive, Docs, Calendar):"
echo "    • .../auth/gmail.readonly"
echo "    • .../auth/gmail.send"
echo "    • .../auth/drive.readonly"
echo "    • .../auth/documents.readonly"
echo "    • .../auth/calendar.readonly"
echo "    • .../auth/calendar.events"
echo ""
echo "STEP 3 — Enable APIs (Library)"
echo "  • Gmail API"
echo "  • Google Drive API"
echo "  • Google Docs API"
echo "  • Google Calendar API"
echo ""
echo "STEP 4 — Create OAuth 2.0 Client ID (Web application)"
echo "  Open: https://console.cloud.google.com/apis/credentials/oauthclient?project=${PROJECT_ID}"
echo ""
echo "  Authorized JavaScript origins:"
echo "    ${SITE}"
echo "    http://localhost:8765"
echo ""
echo "  Authorized redirect URIs:"
echo "    ${SUPABASE_CALLBACK}"
echo "    ${SITE}/auth/google-callback.html"
echo "    http://localhost:8765/auth/google-callback.html"
echo ""
echo "STEP 5 — Test users (while app is in Testing mode)"
echo "  Add your Google account under OAuth consent screen → Test users"
echo ""
read -r -p "Press Enter when the OAuth client is created…"

echo ""
read -r -p "Paste Google Client ID: " CLIENT_ID
read -r -s -p "Paste Google Client secret: " CLIENT_SECRET
echo ""

if [[ -z "${CLIENT_ID}" || -z "${CLIENT_SECRET}" ]]; then
  echo "Client ID and secret are required."
  exit 1
fi

echo ""
echo "Setting Supabase Edge Function secrets…"
supabase secrets set \
  "OAUTH_GOOGLE_CLIENT_ID=${CLIENT_ID}" \
  "OAUTH_GOOGLE_CLIENT_SECRET=${CLIENT_SECRET}" \
  --project-ref "${SUPABASE_REF}"

echo ""
echo "Redeploying Google OAuth edge functions…"
supabase functions deploy google-auth-start google-auth-complete oauth-link-from-session oauth-callback --project-ref "${SUPABASE_REF}"

echo ""
echo "=== STEP 6 — Supabase Auth (manual, one-time) ==="
echo "  Open: https://supabase.com/dashboard/project/${SUPABASE_REF}/auth/providers"
echo "  • Enable Google"
echo "  • Paste the SAME Client ID and Client secret"
echo "  • URL Configuration → Site URL: ${SITE}"
echo "  • Redirect URLs: ${SITE}, ${SITE}/, http://localhost:8765, http://localhost:8765/"
echo ""
echo "Done. Verify:"
echo "  • Sign in: ${SITE} → Continue with Google"
echo "  • Connect: Dashboard → Connections → Google Workspace"
echo ""

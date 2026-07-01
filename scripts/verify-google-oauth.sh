#!/usr/bin/env bash
# Quick smoke test for worlo Google OAuth after domain changes.
set -euo pipefail

SITE="${SITE:-https://worlo.site}"
SUPABASE_URL="${SUPABASE_URL:-https://utofnywijqsozjqmkhcn.supabase.co}"
CALLBACK="${SITE}/auth/google-callback.html"

echo "=== worlo.site pages ==="
for p in "/" "/auth/google-callback.html" "/privacy-policy.html" "/terms-of-service.html"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "${SITE}${p}")
  echo "  ${p} -> ${code}"
done

echo ""
echo "=== Edge function: google-auth-start ==="
RESP=$(curl -s -X POST "${SUPABASE_URL}/functions/v1/google-auth-start" \
  -H "Content-Type: application/json" \
  -d "{\"mode\":\"signin\",\"redirectUri\":\"${CALLBACK}\",\"returnUrl\":\"/\"}")

if echo "$RESP" | grep -q '"url"'; then
  echo "  OK — edge function accepts ${CALLBACK}"
  AUTH_URL=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['url'])")
else
  echo "  FAIL — $RESP"
  exit 1
fi

echo ""
echo "=== Google Cloud redirect URI registration ==="
TMP=$(mktemp)
curl -sL -o "$TMP" -w "" "$AUTH_URL"
if rg -q "redirect_uri_mismatch" "$TMP"; then
  echo "  FAIL — Google returned redirect_uri_mismatch"
  echo "  Add this redirect URI in Google Cloud Console:"
  echo "    ${CALLBACK}"
  echo "  And this JavaScript origin:"
  echo "    ${SITE}"
  echo ""
  echo "  Edit client:"
  echo "  https://console.cloud.google.com/apis/credentials/oauthclient/183871895273-4a2jg0na0m10ochjclvb2apemivdj33f.apps.googleusercontent.com?project=worlo-500418"
  rm -f "$TMP"
  exit 1
fi

rm -f "$TMP"
echo "  OK — Google accepts the redirect URI (no mismatch error)"
echo ""
echo "All checks passed."

#!/usr/bin/env bash
# Push OAuth provider secrets to Supabase Edge Functions.
# Usage: copy oauth-secrets.local.env.example → oauth-secrets.local.env, fill values, then:
#   ./scripts/push-oauth-secrets.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ROOT}/oauth-secrets.local.env"
SUPABASE_REF="${SUPABASE_PROJECT_REF:-utofnywijqsozjqmkhcn}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing ${ENV_FILE}"
  echo "Copy oauth-secrets.local.env.example and add your OAuth client IDs/secrets."
  exit 1
fi

cd "${ROOT}"

while IFS= read -r line || [[ -n "${line}" ]]; do
  line="$(echo "${line}" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  [[ -z "${line}" || "${line}" == \#* ]] && continue
  name="${line%%=*}"
  value="${line#*=}"
  value="$(echo "${value}" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  [[ -z "${value}" ]] && { echo "Skipping empty ${name}"; continue; }
  echo "Setting ${name}…"
  supabase secrets set "${name}=${value}" --project-ref "${SUPABASE_REF}"
done < "${ENV_FILE}"

echo "Done. Redeploy: supabase functions deploy google-auth-start google-auth-complete oauth-start oauth-callback oauth-link-from-session"

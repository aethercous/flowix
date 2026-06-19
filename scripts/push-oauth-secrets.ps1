# Push OAuth provider secrets to Supabase Edge Functions (platform owner only).
# Usage: copy oauth-secrets.local.env.example -> oauth-secrets.local.env, fill values, then:
#   .\scripts\push-oauth-secrets.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$envFile = Join-Path $root "oauth-secrets.local.env"

if (-not (Test-Path $envFile)) {
  Write-Host "Missing $envFile"
  Write-Host "Copy oauth-secrets.local.env.example and add your OAuth client IDs/secrets."
  exit 1
}

Push-Location $root
try {
  Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) { return }
    $eq = $line.IndexOf("=")
    if ($eq -lt 1) { return }
    $name = $line.Substring(0, $eq).Trim()
    $value = $line.Substring($eq + 1).Trim()
    if (-not $value) {
      Write-Host "Skipping empty $name"
      return
    }
    Write-Host "Setting $name ..."
    supabase secrets set "${name}=${value}" | Out-Host
  }
  Write-Host "Done. Redeploy functions: supabase functions deploy oauth-start oauth-callback oauth-link-from-session"
} finally {
  Pop-Location
}

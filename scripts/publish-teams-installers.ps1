# Copy electron-builder output into /downloads for Vercel static hosting.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$dist = Join-Path $root 'flowix-teams-desktop\dist'
$out = Join-Path $root 'downloads'

if (-not (Test-Path $out)) { New-Item -ItemType Directory -Path $out | Out-Null }

$win = Get-ChildItem -Path $dist -Filter 'flowix-teams-setup*.exe' -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
if ($win) {
  Copy-Item $win.FullName (Join-Path $out 'flowix-teams-setup.exe') -Force
  Write-Host "Published Windows installer: flowix-teams-setup.exe"
} else {
  Write-Warning "No Windows .exe found. Run: cd flowix-teams-desktop; npm run build:win"
}

$mac = Get-ChildItem -Path $dist -Filter 'flowix-teams*.dmg' -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
if ($mac) {
  Copy-Item $mac.FullName (Join-Path $out 'flowix-teams-mac.dmg') -Force
  Write-Host "Published Mac installer: flowix-teams-mac.dmg"
} else {
  Write-Warning "No Mac .dmg found (build on macOS or use GitHub Actions)."
}

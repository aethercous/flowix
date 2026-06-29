# Build small worlo Teams portable zips (web + launcher) for /downloads/
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$downloads = Join-Path $root 'downloads'
if (-not (Test-Path $downloads)) { New-Item -ItemType Directory -Path $downloads | Out-Null }

function Write-TeamsPortable($stageDir, $launcherName, $launcherBody) {
  if (Test-Path $stageDir) { Remove-Item -Recurse -Force $stageDir }
  New-Item -ItemType Directory -Path $stageDir | Out-Null
  Copy-Item -Recurse -Force (Join-Path $root 'teams-app') (Join-Path $stageDir 'teams-app')
  Copy-Item -Force (Join-Path $root 'worlo-tines.css') $stageDir
  Copy-Item -Force (Join-Path $root 'worlo-landing.css') $stageDir
  Copy-Item -Force (Join-Path $root 'worlo-sky.css') $stageDir
  Copy-Item -Force (Join-Path $root 'worlo-config.js') $stageDir
  [System.IO.File]::WriteAllText((Join-Path $stageDir $launcherName), $launcherBody.Replace("`r`n", "`n"))
  $readme = @"
worlo Teams portable
=====================
1. Unzip this folder anywhere.
2. Run "$launcherName".
3. Your browser opens worlo Teams — paste your WORLO invite code from the dashboard.

Chat requires an internet connection (Supabase).
"@
  [System.IO.File]::WriteAllText((Join-Path $stageDir 'README.txt'), $readme)
}

# Windows: launcher opens the app in a standalone Edge/Chrome window (uses the
# W favicon as the taskbar icon); falls back to the default browser.
$winStage = Join-Path $root 'downloads\_stage-win'
$winBat = @'
@echo off
setlocal
cd /d "%~dp0"
set "URL=%~dp0teams-app\index.html"
set "APPURL=file:///%URL:\=/%"
set "E1=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
set "E2=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
set "C1=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
set "C2=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if exist "%E1%" ( start "" "%E1%" --app="%APPURL%" & exit /b )
if exist "%E2%" ( start "" "%E2%" --app="%APPURL%" & exit /b )
if exist "%C1%" ( start "" "%C1%" --app="%APPURL%" & exit /b )
if exist "%C2%" ( start "" "%C2%" --app="%APPURL%" & exit /b )
start "" "%URL%"
'@
Write-TeamsPortable $winStage 'Open worlo Teams.bat' $winBat
$winZip = Join-Path $downloads 'worlo-teams-win.zip'
if (Test-Path $winZip) { Remove-Item $winZip -Force }
Compress-Archive -Path (Join-Path $winStage '*') -DestinationPath $winZip -CompressionLevel Optimal
Remove-Item -Recurse -Force $winStage
Write-Host "Windows: $winZip ($([math]::Round((Get-Item $winZip).Length / 1KB)) KB)"

# Mac: launcher opens the app in a standalone Chrome window (uses the W favicon
# as the dock icon); falls back to Safari / default browser.
$macStage = Join-Path $root 'downloads\_stage-mac'
$macCmd = @'
#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
xattr -dr com.apple.quarantine "$DIR" 2>/dev/null || true
URL="file://${DIR}/teams-app/index.html"
if [ -d "/Applications/Google Chrome.app" ]; then
  open -na "Google Chrome" --args --app="$URL"
else
  open -a Safari "$URL" 2>/dev/null || open "$URL"
fi
'@
Write-TeamsPortable $macStage 'Open worlo Teams.command' $macCmd
$macZip = Join-Path $downloads 'worlo-teams-mac.zip'
if (Test-Path $macZip) { Remove-Item $macZip -Force }
Compress-Archive -Path (Join-Path $macStage '*') -DestinationPath $macZip -CompressionLevel Optimal
Remove-Item -Recurse -Force $macStage
Write-Host "macOS: $macZip ($([math]::Round((Get-Item $macZip).Length / 1KB)) KB)"
Write-Host 'Done — commit downloads/*.zip and redeploy to Vercel.'

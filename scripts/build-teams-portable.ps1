# Build small flowix Teams portable zips (web + launcher) for /downloads/
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$downloads = Join-Path $root 'downloads'
if (-not (Test-Path $downloads)) { New-Item -ItemType Directory -Path $downloads | Out-Null }

function Write-TeamsPortable($stageDir, $launcherName, $launcherBody) {
  if (Test-Path $stageDir) { Remove-Item -Recurse -Force $stageDir }
  New-Item -ItemType Directory -Path $stageDir | Out-Null
  Copy-Item -Recurse -Force (Join-Path $root 'teams-app') (Join-Path $stageDir 'teams-app')
  Copy-Item -Force (Join-Path $root 'flowix-tines.css') $stageDir
  Copy-Item -Force (Join-Path $root 'flowix-landing.css') $stageDir
  Copy-Item -Force (Join-Path $root 'flowix-config.js') $stageDir
  [System.IO.File]::WriteAllText((Join-Path $stageDir $launcherName), $launcherBody.Replace("`r`n", "`n"))
  $readme = @"
flowix Teams portable
=====================
1. Unzip this folder anywhere.
2. Run "$launcherName".
3. Your browser opens flowix Teams — paste your FLOWIX invite code from the dashboard.

Chat requires an internet connection (Supabase).
"@
  [System.IO.File]::WriteAllText((Join-Path $stageDir 'README.txt'), $readme)
}

# Windows: .bat opens local index.html in default browser
$winStage = Join-Path $root 'downloads\_stage-win'
$winBat = @'
@echo off
cd /d "%~dp0"
start "" "%~dp0teams-app\index.html"
'@
Write-TeamsPortable $winStage 'Open flowix Teams.bat' $winBat
$winZip = Join-Path $downloads 'flowix-teams-win.zip'
if (Test-Path $winZip) { Remove-Item $winZip -Force }
Compress-Archive -Path (Join-Path $winStage '*') -DestinationPath $winZip -CompressionLevel Optimal
Remove-Item -Recurse -Force $winStage
Write-Host "Windows: $winZip ($([math]::Round((Get-Item $winZip).Length / 1KB)) KB)"

# Mac: .command opens Safari to local file
$macStage = Join-Path $root 'downloads\_stage-mac'
$macCmd = @'
#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
FILE="file://${DIR}/teams-app/index.html"
open -a Safari "$FILE" 2>/dev/null || open "$FILE"
'@
Write-TeamsPortable $macStage 'Open flowix Teams.command' $macCmd
$macZip = Join-Path $downloads 'flowix-teams-mac.zip'
if (Test-Path $macZip) { Remove-Item $macZip -Force }
Compress-Archive -Path (Join-Path $macStage '*') -DestinationPath $macZip -CompressionLevel Optimal
Remove-Item -Recurse -Force $macStage
Write-Host "macOS: $macZip ($([math]::Round((Get-Item $macZip).Length / 1KB)) KB)"
Write-Host 'Done — commit downloads/*.zip and redeploy to Vercel.'

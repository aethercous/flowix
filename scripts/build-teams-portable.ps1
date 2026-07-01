# Build small worlo Teams portable zips (web + launcher) for /downloads/
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$downloads = Join-Path $root 'downloads'
if (-not (Test-Path $downloads)) { New-Item -ItemType Directory -Path $downloads | Out-Null }

function Write-TeamsPortable($stageDir, $launcherName, $launcherBody, $readme) {
  if (Test-Path $stageDir) { Remove-Item -Recurse -Force $stageDir }
  New-Item -ItemType Directory -Path $stageDir | Out-Null
  Copy-Item -Recurse -Force (Join-Path $root 'teams-app') (Join-Path $stageDir 'teams-app')
  Copy-Item -Force (Join-Path $root 'worlo-tines.css') $stageDir
  Copy-Item -Force (Join-Path $root 'worlo-landing.css') $stageDir
  Copy-Item -Force (Join-Path $root 'worlo-sky.css') $stageDir
  Copy-Item -Force (Join-Path $root 'worlo-config.js') $stageDir
  [System.IO.File]::WriteAllText((Join-Path $stageDir $launcherName), $launcherBody.Replace("`r`n", "`n"))
  [System.IO.File]::WriteAllText((Join-Path $stageDir 'README.txt'), $readme)
}

# Windows portable zip — unzip then double-click "Worlo Teams.bat" (or .vbs for no console).
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
$winVbs = @'
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.Run Chr(34) & dir & "\Worlo Teams.bat" & Chr(34), 0, False
'@
$winReadme = @"
worlo Teams (Windows portable)
==============================
1. Unzip this folder anywhere.
2. Double-click "Worlo Teams.bat" (or "Worlo Teams.vbs").
   worlo Teams opens in its own window.

For a one-file download that opens without unzipping, get
worlo-teams-portable.exe from https://worlo.site/teams-app/download.html

Need an invite code? Get one from the worlo dashboard.
"@
Write-TeamsPortable $winStage 'Worlo Teams.bat' $winBat $winReadme
[System.IO.File]::WriteAllText((Join-Path $winStage 'Worlo Teams.vbs'), $winVbs.Replace("`r`n", "`n"))
$winZip = Join-Path $downloads 'worlo-teams-win.zip'
if (Test-Path $winZip) { Remove-Item $winZip -Force }
Compress-Archive -Path (Join-Path $winStage '*') -DestinationPath $winZip -CompressionLevel Optimal
Remove-Item -Recurse -Force $winStage
Write-Host "Windows: $winZip ($([math]::Round((Get-Item $winZip).Length / 1KB)) KB)"

# macOS: self-contained Worlo Teams.app (requires bash — macOS CI or local Mac).
$macScript = Join-Path $root 'scripts/build-teams-mac-app.sh'
if (Test-Path $macScript) {
  $bash = Get-Command bash -ErrorAction SilentlyContinue
  if ($bash) {
    & bash $macScript
  } else {
    Write-Warning 'bash not found — skipping Mac .app zip (run scripts/build-teams-mac-app.sh on macOS).'
  }
} else {
  Write-Warning 'scripts/build-teams-mac-app.sh missing — skipping Mac zip.'
}

Write-Host 'Done — commit downloads/*.zip and redeploy to Vercel.'

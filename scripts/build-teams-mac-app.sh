#!/usr/bin/env bash
# Build worlo Teams for macOS — native Electron .app (stays open, W icon in Dock).
# Lightweight fallback: a .command launcher (no fake .app that bounces and quits).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/downloads/worlo-teams-mac.zip"
ELECTRON_ZIP="$ROOT/worlo-teams-desktop/dist/worlo-teams-mac.zip"

if [ -f "$ELECTRON_ZIP" ]; then
  cp "$ELECTRON_ZIP" "$OUT"
  KB=$(( $(stat -f%z "$OUT" 2>/dev/null || stat -c%s "$OUT") / 1024 ))
  echo "macOS (Electron): $OUT (${KB} KB)"
  exit 0
fi

# Fallback — do NOT ship a shell .app (it spawns Chrome and exits, Dock icon bounces).
STAGE="$ROOT/downloads/_stage-mac"
LAUNCHER="$STAGE/Open worlo Teams.command"
README="$STAGE/README.txt"

rm -rf "$STAGE"
mkdir -p "$STAGE"

cat > "$LAUNCHER" << 'LAUNCHER'
#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
xattr -dr com.apple.quarantine "$DIR" 2>/dev/null || true
URL="https://worlo.site/teams-app/index.html"
if [ -d "/Applications/Google Chrome.app" ]; then
  open -a "Google Chrome" --args --new --app="$URL"
elif [ -d "/Applications/Microsoft Edge.app" ]; then
  open -a "Microsoft Edge" --args --new --app="$URL"
else
  open "$URL"
fi
LAUNCHER
chmod +x "$LAUNCHER"

cat > "$README" << 'README'
worlo Teams (Mac — lightweight launcher)
========================================
This zip is a small launcher. For the full native app (worlo W icon in your Dock),
download worlo-teams-mac.zip from GitHub Releases:
https://github.com/aethercous/flowix/releases/latest

To use this launcher:
1. Unzip anywhere.
2. Double-click "Open worlo Teams.command"
   (first time: right-click → Open if macOS blocks it)
3. worlo Teams opens in its own window.

Requires internet.
README

rm -f "$OUT"
( cd "$STAGE" && zip -rqX "$OUT" . )
rm -rf "$STAGE"

KB=$(( $(stat -f%z "$OUT" 2>/dev/null || stat -c%s "$OUT") / 1024 ))
echo "macOS (launcher fallback): $OUT (${KB} KB)"

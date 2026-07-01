#!/usr/bin/env bash
# Build worlo Teams as a self-contained macOS .app inside downloads/worlo-teams-mac.zip.
# After unzip, double-click "Worlo Teams.app" to launch — no separate launcher script.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAGE="$ROOT/downloads/_stage-mac"
APP="$STAGE/Worlo Teams.app"
RES="$APP/Contents/Resources"
MACOS="$APP/Contents/MacOS"
OUT="$ROOT/downloads/worlo-teams-mac.zip"

rm -rf "$STAGE"
mkdir -p "$MACOS" "$RES/teams-app"

cp -R "$ROOT/teams-app/." "$RES/teams-app/"
find "$RES" -name .DS_Store -delete 2>/dev/null || true
cp "$ROOT/worlo-tines.css" "$ROOT/worlo-landing.css" "$ROOT/worlo-sky.css" "$ROOT/worlo-config.js" "$RES/"

if [ -f "$ROOT/worlo-teams-desktop/build/icon.icns" ]; then
  cp "$ROOT/worlo-teams-desktop/build/icon.icns" "$RES/AppIcon.icns"
fi

cat > "$MACOS/worlo-teams" << 'LAUNCHER'
#!/bin/bash
BUNDLE="$(cd "$(dirname "$0")/.." && pwd)"
RES="$BUNDLE/Resources"
xattr -dr com.apple.quarantine "$BUNDLE" 2>/dev/null || true
HTML="file://${RES}/teams-app/index.html"
if [ -d "/Applications/Google Chrome.app" ]; then
  open -na "Google Chrome" --args --app="$HTML"
elif [ -d "/Applications/Microsoft Edge.app" ]; then
  open -na "Microsoft Edge" --args --app="$HTML"
else
  open -a Safari "$HTML" 2>/dev/null || open "$HTML"
fi
LAUNCHER
chmod +x "$MACOS/worlo-teams"

cat > "$APP/Contents/Info.plist" << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key><string>en</string>
  <key>CFBundleExecutable</key><string>worlo-teams</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundleIdentifier</key><string>com.worlo.teams</string>
  <key>CFBundleName</key><string>worlo Teams</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0.0</string>
  <key>CFBundleVersion</key><string>1.0.0</string>
  <key>LSMinimumSystemVersion</key><string>10.13</string>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
PLIST

rm -f "$OUT"
( cd "$STAGE" && zip -rqX "$OUT" "Worlo Teams.app" )
rm -rf "$STAGE"

KB=$(( $(stat -f%z "$OUT" 2>/dev/null || stat -c%s "$OUT") / 1024 ))
echo "macOS: $OUT (${KB} KB)"

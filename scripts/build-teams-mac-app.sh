#!/usr/bin/env bash
# Build worlo Teams for macOS.
# Output: downloads/worlo-teams-mac.zip containing "worlo Teams.app" at the top level
# (double-click the app after unzip — not the folder arrow).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/downloads/worlo-teams-mac.zip"
ELECTRON_ZIP="$ROOT/worlo-teams-desktop/dist/worlo-teams-mac.zip"
STAGE="$ROOT/downloads/_stage-mac"
APP="$STAGE/worlo Teams.app"
RES="$APP/Contents/Resources"
MACOS="$APP/Contents/MacOS"

package_app() {
  rm -rf "$STAGE"
  mkdir -p "$MACOS" "$RES"

  if [ -f "$ROOT/worlo-teams-desktop/build/icon.icns" ]; then
    cp "$ROOT/worlo-teams-desktop/build/icon.icns" "$RES/AppIcon.icns"
  fi

  cat > "$MACOS/worlo-teams" << 'LAUNCHER'
#!/bin/bash
BUNDLE="$(cd "$(dirname "$0")/.." && pwd)"
xattr -dr com.apple.quarantine "$BUNDLE" 2>/dev/null || true
URL="https://worlo.site/teams-app/index.html"

launch() {
  if [ -d "/Applications/Google Chrome.app" ]; then
    open -n -a "Google Chrome" --args --app="$URL"
    return 0
  fi
  if [ -d "/Applications/Microsoft Edge.app" ]; then
    open -n -a "Microsoft Edge" --args --app="$URL"
    return 0
  fi
  open "$URL"
}

launch

# Keep this app alive in the Dock until the user closes the worlo Teams window.
while true; do
  sleep 3
  if ! pgrep -if "Chrome.*worlo\.site/teams-app" >/dev/null 2>&1 \
     && ! pgrep -if "Edge.*worlo\.site/teams-app" >/dev/null 2>&1 \
     && ! pgrep -if "Safari.*worlo\.site/teams-app" >/dev/null 2>&1; then
    break
  fi
done
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
  <key>CFBundleDisplayName</key><string>worlo Teams</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0.0</string>
  <key>CFBundleVersion</key><string>1.0.0</string>
  <key>LSMinimumSystemVersion</key><string>10.13</string>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
PLIST

  rm -f "$OUT"
  ( cd "$STAGE" && zip -rqX "$OUT" "worlo Teams.app" )
  rm -rf "$STAGE"
}

# Lightweight .app for worlo.site (small zip). Full Electron zip is published via GitHub Releases.
if [ "${1:-}" = "--lightweight" ] || [ "${WORLO_MAC_LIGHTWEIGHT:-}" = "1" ]; then
  package_app
  KB=$(( $(stat -f%z "$OUT" 2>/dev/null || stat -c%s "$OUT") / 1024 ))
  echo "macOS (lightweight app bundle): $OUT (${KB} KB)"
  exit 0
fi

# Prefer native Electron build when available (real window + W Dock icon).
if [ -f "$ELECTRON_ZIP" ]; then
  rm -rf "$STAGE"
  mkdir -p "$STAGE"
  unzip -q "$ELECTRON_ZIP" -d "$STAGE"
  # Electron zip may use "worlo Teams.app" — normalize name to "worlo Teams.app"
  if [ -d "$STAGE/worlo Teams.app" ] && [ ! -d "$APP" ]; then
    mv "$STAGE/worlo Teams.app" "$APP"
  fi
  if [ -d "$APP" ]; then
    rm -f "$OUT"
    ( cd "$STAGE" && zip -rqX "$OUT" "worlo Teams.app" )
    rm -rf "$STAGE"
    KB=$(( $(stat -f%z "$OUT" 2>/dev/null || stat -c%s "$OUT") / 1024 ))
    echo "macOS (Electron): $OUT (${KB} KB)"
    exit 0
  fi
  rm -rf "$STAGE"
fi

package_app
KB=$(( $(stat -f%z "$OUT" 2>/dev/null || stat -c%s "$OUT") / 1024 ))
echo "macOS (app bundle): $OUT (${KB} KB)"

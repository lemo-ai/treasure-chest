#!/usr/bin/env bash
# Patch the Electron.app dock/Finder icon used by `electron-vite dev`.
# Runtime app.dock.setIcon() is unreliable on newer macOS; the Dock reads
# Electron.app/Contents/Resources/electron.icns instead.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC_ICNS="$ROOT/resources/icon.icns"
SRC_PNG="$ROOT/resources/icon.png"
ELECTRON_APP="$ROOT/node_modules/electron/dist/Electron.app"
DEST_ICNS="$ELECTRON_APP/Contents/Resources/electron.icns"
BACKUP_ICNS="$ELECTRON_APP/Contents/Resources/electron.icns.original"

if [[ ! -d "$ELECTRON_APP" ]]; then
  echo "[patch-electron-icon] Electron.app not found, skip"
  exit 0
fi

if [[ ! -f "$SRC_ICNS" ]]; then
  if [[ ! -f "$SRC_PNG" ]]; then
    echo "[patch-electron-icon] resources/icon.icns missing, skip"
    exit 0
  fi
  echo "[patch-electron-icon] generating icon.icns from icon.png"
  ICONSET="$(mktemp -d)/icon.iconset"
  mkdir -p "$ICONSET"
  sips -z 16 16 "$SRC_PNG" --out "$ICONSET/icon_16x16.png" >/dev/null
  sips -z 32 32 "$SRC_PNG" --out "$ICONSET/icon_16x16@2x.png" >/dev/null
  sips -z 32 32 "$SRC_PNG" --out "$ICONSET/icon_32x32.png" >/dev/null
  sips -z 64 64 "$SRC_PNG" --out "$ICONSET/icon_32x32@2x.png" >/dev/null
  sips -z 128 128 "$SRC_PNG" --out "$ICONSET/icon_128x128.png" >/dev/null
  sips -z 256 256 "$SRC_PNG" --out "$ICONSET/icon_128x128@2x.png" >/dev/null
  sips -z 256 256 "$SRC_PNG" --out "$ICONSET/icon_256x256.png" >/dev/null
  sips -z 512 512 "$SRC_PNG" --out "$ICONSET/icon_256x256@2x.png" >/dev/null
  sips -z 512 512 "$SRC_PNG" --out "$ICONSET/icon_512x512.png" >/dev/null
  sips -z 1024 1024 "$SRC_PNG" --out "$ICONSET/icon_512x512@2x.png" >/dev/null
  iconutil -c icns "$ICONSET" -o "$SRC_ICNS"
  rm -rf "$(dirname "$ICONSET")"
fi

if [[ -f "$DEST_ICNS" && ! -f "$BACKUP_ICNS" ]]; then
  cp "$DEST_ICNS" "$BACKUP_ICNS"
fi

# Skip if already patched to the same bytes.
if [[ -f "$DEST_ICNS" ]] && cmp -s "$SRC_ICNS" "$DEST_ICNS"; then
  echo "[patch-electron-icon] already up to date"
  exit 0
fi

cp "$SRC_ICNS" "$DEST_ICNS"
# Bump mtime so LaunchServices / Dock pick up the new icon.
touch "$ELECTRON_APP"
touch "$ELECTRON_APP/Contents/Info.plist"

# Best-effort refresh of icon services (ignore failures).
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister \
  -f "$ELECTRON_APP" >/dev/null 2>&1 || true

echo "[patch-electron-icon] patched Electron.app icon -> treasure-chest"

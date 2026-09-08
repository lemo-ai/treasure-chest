#!/usr/bin/env bash
# Cursor / some IDEs set ELECTRON_RUN_AS_NODE=1 which breaks Electron apps.
unset ELECTRON_RUN_AS_NODE
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
bash "$ROOT/scripts/sync-ort-wasm.sh"
bash "$ROOT/scripts/patch-electron-icon.sh"
exec npx electron-vite dev "$@"

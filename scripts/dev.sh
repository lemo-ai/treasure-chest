#!/usr/bin/env bash
# Cursor / some IDEs set ELECTRON_RUN_AS_NODE=1 which breaks Electron apps.
unset ELECTRON_RUN_AS_NODE
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
bash "$ROOT/scripts/sync-ort-wasm.sh"
bash "$ROOT/scripts/patch-electron-icon.sh"
# Accidental tsc emit next to .ts is preferred by Vite over source — wipe before dev.
bash "$ROOT/scripts/clean-stale-tsc-emit.sh"
exec npx electron-vite dev "$@"

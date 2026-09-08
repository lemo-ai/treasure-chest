#!/usr/bin/env bash
# Copy onnxruntime-web WASM assets into renderer public/ (gitignored).
# Package exports hide dist/*.wasm from Vite imports; serving from /ort/ avoids that.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/node_modules/onnxruntime-web/dist"
DEST="$ROOT/src/public/ort"
if [[ ! -f "$SRC/ort-wasm-simd-threaded.wasm" || ! -f "$SRC/ort-wasm-simd-threaded.mjs" ]]; then
  echo "[sync-ort-wasm] onnxruntime-web dist assets missing; skip (run npm install)"
  exit 0
fi
mkdir -p "$DEST"
cp "$SRC/ort-wasm-simd-threaded.wasm" "$SRC/ort-wasm-simd-threaded.mjs" "$DEST/"
echo "[sync-ort-wasm] synced -> $DEST"

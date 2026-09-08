#!/usr/bin/env bash
# Remove accidental sibling .js/.d.ts next to TypeScript sources.
# electron-vite / Vite resolve .js before .ts, so stale emits ship old behavior
# (e.g. catalog still downloading big-lama.pt, missing remove_watermark handler).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

removed=0
while IFS= read -r -d '' f; do
  rm -f "$f"
  removed=$((removed + 1))
done < <(find electron packages/shared/src src/features src/app src/shared \
  \( -name '*.js' -o -name '*.d.ts' \) -type f -print0 2>/dev/null)

rm -f electron.vite.config.js electron.vite.config.d.ts src/main.js src/main.d.ts
rm -rf packages/shared/dist

if [[ "$removed" -gt 0 ]]; then
  echo "[clean-stale-tsc-emit] removed $removed sibling emit file(s)"
fi

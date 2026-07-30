#!/usr/bin/env bash
# Cursor / some IDEs set ELECTRON_RUN_AS_NODE=1 which breaks Electron apps.
unset ELECTRON_RUN_AS_NODE
exec npx electron-vite dev "$@"

# Qiankun

[中文](README.zh-CN.md) | [English](README.en.md) · [Overview README](README.md)

**Qiankun** (Chinese brand **袖里乾坤**, repository `treasure-chest`) is a **local-first AI agent workbench**: chat, knowledge base, schedules, tools, and data sources — all on your machine, with no account required.

> Formerly known as “Treasure Chest”. Current version **0.4.0**.

## Features

| Area | What you get |
|------|----------------|
| **Workbench** | Multi-agent chat with visible tool calls; send queue while a reply streams |
| **Agents** | Built-in fortune / stocks and more; custom agents; bind data sources & Skills (incl. lottery analysis demo) |
| **Knowledge** | On-device RAG: collection tree, document ingest, hybrid retrieval for chat |
| **Schedules** | Interval / window tasks; deliver results to inbox, DingTalk, and email |
| **Data sources** | Card UI for common databases; list/query tools for agents |
| **Toolkit** | Timestamp, timezone, JSON, image / audio-video / documents, web crawl, and more |
| **Calendar** | Lunar calendar and work/rest holiday badges; optional desktop widget window |
| **Settings** | Models & APIs, MCP, notification channels, theme, i18n (`zh-CN` / `en-US`) |

**Principles**: local-first; data stays on disk; API keys in OS secure storage.

## Stack

Electron · React · TypeScript · Vite · SQLite · Zustand · i18next

Platforms: macOS (Intel / Apple Silicon), Windows (plus packable Linux artifacts).

## Develop

```bash
npm install
npm run dev
```

If Electron fails to start in Cursor-like environments (`electron.app` is `undefined`), the usual cause is `ELECTRON_RUN_AS_NODE=1`. `npm run dev` unsets it via `scripts/dev.sh`.

Keep the Electron mirror in `.npmrc` if downloads from GitHub releases are slow.

```bash
npm run typecheck
npm run test
npm run build
npm run dist
```

## Layout

```
electron/           # main process (windows, IPC, modules)
src/features/       # renderer features
packages/shared/    # shared types & IPC channels
config/             # runtime config (e.g. changelog)
docs/               # design docs (mostly Chinese)
```

Theme tokens live only in `src/shared/styles/tokens.css`.

## Docs

- [Technical design](docs/技术方案.md) (Chinese)
- [Agent workbench plan](docs/产品规划-2.0-智能体工作台.md) (Chinese)
- [Knowledge base design](docs/知识库技术方案.md) (Chinese)

## Download & repo

- GitHub: https://github.com/lemo-ai/treasure-chest
- Releases may include macOS DMGs (e.g. `袖里乾坤-0.4.0-arm64.dmg`)

## License

Private / `UNLICENSED` for now. Open-source license TBD.

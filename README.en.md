# Qiankun (袖里乾坤)

[中文](README.zh-CN.md) | [English](README.en.md)

**Qiankun** is a **local-first AI agent workbench** (npm / repo name: `treasure-chest`; Chinese product name: 袖里乾坤). Manage agents and sessions on the left, collaborate in chat in the center, keep a knowledge base on disk, run schedules for daily briefings, and use a built-in toolkit for everyday and media tasks — **no account required; data stays on your machine by default**.

| | |
|--|--|
| Version | **0.4.0** |
| App ID | `com.lemo.treasure-chest` |
| Former name | Treasure Chest |
| Repository | https://github.com/lemo-ai/treasure-chest |

---

## Positioning

Desktop AI workbench UX (chat shell, visible tool use, extensible agents) plus local calendar, fortune, stocks, and lottery research helpers.

- **Local-first**: settings, chats, knowledge, and crawl data live under the app user-data directory
- **No account system**: requests go only to endpoints you configure
- **Secrets**: API keys use OS secure storage, not plaintext config files
- **Extensible**: custom agents, Skills, MCP servers, data sources, schedules

> **Disclaimer**: AI replies, fortune readings, stock ideas, and lottery analysis are for learning / entertainment only. They are **not** investment, betting, medical, or legal advice. Respect site robots/ToS; do not scrape aggressively.

---

## Features

### 1. Workbench (default home)

Multi-agent chat shell:

- Switch built-in / custom agents; pick model providers
- Inspect tool calls (search, crawl, knowledge, data sources, coding sandbox, …)
- **Send queue**: type follow-ups while a reply streams; remove one item or clear all
- Optional: knowledge `@` mentions, web lookup, MCP, Skills, coding Harness
- Quick prompts, streaming, session management

### 2. Agents

| Built-in | Role |
|----------|------|
| **Direct model** | No domain persona; chat + general tools + coding sandbox |
| **Daily fortune** | Hexagram / daily fortune; weather helpers |
| **Stock advisor** | Quotes, recommendation reports, web search / fetch |
| **Lottery advisor** | Editable preset persona; binds local lottery SQLite by default; JC / BJDC shortcuts |

**Custom agents**: persona, logo, model, MCP, knowledge collections, data sources, Skills, quick prompts. Manage and delete them under Settings.

### 3. Knowledge (on-device RAG)

- Collection **tree** (about 5 levels): create / rename / delete; cascade docs or move to default
- Ingest: text, Markdown, Office, PDF, spreadsheets, common images, …
- Chunks in SQLite; FTS + vector search with optional **hybrid** mode
- Embeddings: off / local hash / OpenAI / Ollama / OpenAI-compatible
- Vector store: local JSON by default; optional external backends
- Chat `@knowledge`; agent `search_knowledge` with citation trails

### 4. Schedules

Card UI for:

| Kind | Purpose |
|------|---------|
| Fortune notify | Push today’s fortune |
| Stocks report | Auto stock-advisor report |
| Agent turn | Fixed prompt to an agent (incl. lottery daily sync briefing) |

- **Triggers**: once, daily, interval, windowed repeats
- **Context** (custom): model, Skills, MCP, knowledge, web, data sources; Markdown / HTML reports
- **Delivery**: in-app inbox, desktop notification, DingTalk webhook, SMTP email (per-task overrides)
- Ships with default fortune / stocks / lottery tasks (editable / disableable)

### 5. Notifications

Inbox for full schedule and system results; unread badge; works with DingTalk / email channels.

### 6. Calendar

- Solar / lunar / gan-zhi / daily notes
- China holiday **rest** / **work** badges
- Optional **desktop widget** window from Settings

### 7. Toolkit

| Tool | Summary |
|------|---------|
| Timestamp | Seconds / millis ↔ wall time |
| Timezone | Cross-zone conversion |
| World clock | Major cities vs local time |
| JSON | Format / minify / escape |
| Web crawl | Public pages (body / tables / links); export CSV, XLSX, JSON, TXT; schedule-friendly |
| Image | Classic edits + on-device ONNX (matting, upscale, watermark remove, …) + AI image gen |
| Video | FFmpeg cut/transcode, timeline, AI video |
| Audio | FFmpeg processing, AI music / transcription helpers |
| Documents | Extract, Markdown, Office convert, PDF merge/split/encrypt |

### 8. Settings (highlights)

- **Models & APIs**: multi-provider cards; presets (OpenAI, Volcengine Ark, DashScope, Kling, MiniMax, …); OpenAI / Anthropic protocols; multimodal models
- **Local LLM**: detect / start Ollama; install model families; sync into workbench; LM Studio-friendly checks
- **MCP**: stdio / SSE; seeded Memory, Sequential Thinking, Filesystem, Everything demos
- **Data sources**: 20+ DB / HTTP / file kinds; on-demand drivers; connection test; built-in lottery SQLite; agent `list` / `query`
- **Skills**: meeting notes, email polish, SWOT, code explain, data pipeline, lottery datasource; install external `SKILL.md` catalogs
- **Fortune / stocks**: birth profile, market toggles, scan pool, daily auto reports
- **General**: language (`zh-CN` / `en-US`), theme accents, launch at login, tray, widget, export / backup

---

## Stack & layout

| Layer | Tech |
|-------|------|
| Desktop | Electron 43, electron-vite, electron-builder |
| UI | React 19, TypeScript, Vite, Zustand, react-i18next |
| Local data | better-sqlite3, FTS / vectors |
| Media | ffmpeg-static, onnxruntime-web, … |

```
electron/           Main process: windows, IPC, modules (LLM, schedules, knowledge, stocks, …)
src/features/       Renderer features (workbench, knowledge, schedules, tools, …)
packages/shared/    Shared types & IPC channels
config/             Runtime config (e.g. changelog.json)
docs/               Design docs (mostly Chinese)
resources/          Icons & pack assets
```

Theme tokens live **only** in `src/shared/styles/tokens.css`.

Design docs:

- [Technical design](docs/技术方案.md) (Chinese)
- [Workbench plan](docs/产品规划-2.0-智能体工作台.md) (Chinese)
- [Knowledge design](docs/知识库技术方案.md) (Chinese)

---

## Requirements

- Node.js (current LTS recommended)
- macOS / Windows / Linux (see pack targets)
- Optional: Ollama for local models; cloud API keys as needed

---

## Develop

```bash
git clone https://github.com/lemo-ai/treasure-chest.git
cd treasure-chest
npm install
npm run dev
```

Notes:

- `npm run dev` uses `scripts/dev.sh` to clear `ELECTRON_RUN_AS_NODE=1` (common in Cursor), which otherwise leaves `electron.app` undefined
- Keep the Electron mirror in `.npmrc` if GitHub release downloads are slow
- `postinstall` syncs ONNX wasm and patches the dev icon

### Scripts

| Command | Purpose |
|---------|---------|
| `npm run typecheck` | Typecheck main / renderer / shared |
| `npm run test` | Vitest |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |
| `npm run build` | Typecheck + production build |
| `npm run pack` | Build + unpackaged dir |
| `npm run dist` | Build + installers under `release/` |
| `npm run harness` | Headless Harness automation |

### Pack targets (electron-builder)

| Platform | Format | Arch |
|----------|--------|------|
| macOS | DMG | x64, arm64 |
| Windows | NSIS (choose install dir) | x64 |
| Linux | AppImage, deb | x64 |

Output: `release/` (e.g. `袖里乾坤-0.4.0-arm64.dmg`).

---

## Changelog

In-app changelog reads `config/changelog.json`. Update that file when shipping so zh-CN / en-US entries stay in sync.

Recent:

- **0.4.0**: lottery agent, crawl tool, workbench send queue, data-source / web lookup improvements
- **0.3.0**: schedules, data sources, knowledge tree, seeded MCP, fortune/stocks folded into workbench agents

---

## Privacy

- No project-operated backend for uploading your business data by default
- Traffic only goes to AI / vector / DB endpoints you configure
- Local DB, chats, and knowledge files live under app `userData`; export/backup from Settings

---

## Contributing

Before opening a PR:

```bash
npm run typecheck
npm run test
npm run lint
```

Please include platform, app version, repro steps, and expected behavior.

---

## License

Currently private (`license: UNLICENSED` in `package.json`). Open-source terms are not chosen yet; confirm with maintainers before redistribution.

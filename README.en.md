# Qiankun

[中文](README.zh-CN.md) | [English](README.en.md)

**A local-first AI agent workbench.** Multi-agent chat, on-device knowledge retrieval, scheduled automation, and an extensible tool layer — no account required; your data stays on the machine by default.

Version **0.4.0** · [Docs](docs/README.md) · [Releases](https://github.com/lemo-ai/treasure-chest/releases)

*(Chinese product name: 袖里乾坤. Repository: `treasure-chest`.)*

---

## Core capabilities

### Agent workbench

A chat-first shell: switch built-in or custom agents, stream replies, and inspect tool calls. Queue follow-up messages while a reply is still running — built for continuous collaboration, not one-shot Q&A.

Ships with **Direct model / Daily fortune / Stock advisor / Lottery advisor**. Create your own agents with persona, model, knowledge collections, data sources, and skills.

### On-device knowledge base

Personal RAG: organize documents in a collection tree, chunk and index them, then search with full-text, vector, or hybrid retrieval. Cite knowledge in chat with traceable chunk references — keep reports and domain notes as local context.

### Extensible tool layer

Agents can opt into:

- **Web search & crawl** — research, fetch pages, structured export  
- **Data sources** — query local or remote databases from the agent (including built-in sample stores)  
- **MCP** — plug in standard MCP servers for external tools  
- **Skills** — reusable task playbooks (meeting notes, data pipelines, …)  
- **Coding sandbox** — constrained file/shell workflows for engineering tasks  

### Schedules & notifications

Card-based jobs: daily / interval / windowed runs for fortune alerts, stock reports, or any agent turn. Results land in the in-app inbox and can fan out to desktop notifications, DingTalk, and email.

---

## Also included

Calendar (optional desktop widget) and a general toolkit ship with the app for day-to-day use; they are secondary to the agent-workbench path.

UI: **简体中文 / English**. Models, channels, and appearance live under Settings.

> AI and domain analyses are for reference only — not investment, betting, or legal advice.

---

## Quick start

```bash
git clone https://github.com/lemo-ai/treasure-chest.git
cd treasure-chest
npm install
npm run dev
```

| Command | Purpose |
|---------|---------|
| `npm run typecheck` | Typecheck |
| `npm run test` | Tests |
| `npm run dist` | Build installers into `release/` |

macOS (Intel / Apple Silicon), Windows, and Linux. See [architecture](docs/架构说明.md) (Chinese).

If Electron fails in IDE environments (`electron.app` undefined), use `npm run dev` (clears `ELECTRON_RUN_AS_NODE`). Keep the Electron mirror in `.npmrc` when needed.

---

## Stack

Electron · React · TypeScript · Vite · SQLite · Zustand · i18next

The main process owns LLM orchestration, knowledge, schedules, and native capabilities; the renderer is feature-modular. Full docs: [docs](docs/README.md).

---

## License

Private / `UNLICENSED` for now. Open-source terms TBD.

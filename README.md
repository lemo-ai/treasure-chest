# 百宝箱 Treasure Chest

跨平台桌面百宝箱（macOS Intel / Apple Silicon、Windows）：万年历、今日运势、股票推荐。

技术栈：Electron + React + TypeScript + Vite（依赖取最新稳定版）。方案见 [`docs/技术方案.md`](docs/技术方案.md)。

## 开发

```bash
npm install
npm run dev
```

> 若在 Cursor 等环境里启动失败（`electron.app` 为 undefined），多半是环境变量 `ELECTRON_RUN_AS_NODE=1`。`npm run dev` 已通过 `scripts/dev.sh` 自动 `unset`。

国内网络可保留根目录 `.npmrc` 中的 Electron 镜像配置。

## 其它命令

```bash
npm run typecheck
npm run build
npm run dist
```

## 目录要点

- `electron/`：主进程（窗口、IPC、modules）
- `src/features/`：按功能划分的渲染层
- `src/shared/styles/tokens.css`：**唯一色板**，改肤只改此文件
- `packages/shared/`：跨进程类型与 IPC channel

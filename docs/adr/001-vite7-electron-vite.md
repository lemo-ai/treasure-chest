# ADR-001: Vite 钉在 7.x（暂不跟 Vite 8）

- 日期：2026-07-30
- 状态：接受
- 修订：2026-09-18（迁入整理后的 docs/adr，结论未变）

## 背景

依赖策略要求使用最新稳定版。当时 Vite latest 为 8.x，但 `electron-vite@5` 的 peer 仅声明 `vite@^5 || ^6 || ^7`。

## 决策

开发依赖使用 **Vite 7 最新稳定版** + 与之匹配的 `@vitejs/plugin-react`，与 `electron-vite@5` 对齐。

## 后果

- 符合「兼容性例外可钉上一稳定主线并记 ADR」约定。
- 待 `electron-vite` 正式支持 Vite 8 后，再升级并关闭或替换本 ADR。

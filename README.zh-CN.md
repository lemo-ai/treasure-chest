# 袖里乾坤

[中文](README.zh-CN.md) | [English](README.en.md) · [总览 README](README.md)

**袖里乾坤**（英文短名 **Qiankun**，仓库名 `treasure-chest`）是一款**本机智能体工作台**：对话协作、知识库、定时调度、工具箱与数据源，全部跑在本机，无需账户登录。

> 曾用名「百宝箱」。当前版本 **0.4.0**。

## 能做什么

| 模块 | 说明 |
|------|------|
| **工作台** | 多智能体对话；工具调用可见；会话发送队列（回复中可继续排队提问） |
| **智能体** | 内置运势 / 股票等；可自定义；可绑定数据源与 Skill（含体彩分析示例） |
| **知识库** | 本机 RAG：分区树、文档入库、混合检索增强对话 |
| **定时调度** | 周期 / 窗口任务；结果投递收件箱、钉钉、邮件 |
| **数据源** | 卡片式管理常见数据库；列表 / 查询工具供智能体使用 |
| **工具箱** | 时间戳、时区、JSON、图片 / 音视频 / 文档、网页爬虫等 |
| **万年历** | 农历节气、班休标注；支持桌面挂件窗 |
| **设置** | 模型与 API、MCP、通知通道、主题与多语言（zh-CN / en-US） |

**原则**：全程本机、数据本地；API Key 走系统安全存储。

## 技术栈

Electron · React · TypeScript · Vite · SQLite · Zustand · i18next

平台：macOS（Intel / Apple Silicon）、Windows（及可打包的 Linux 产物）。

## 开发

```bash
npm install
npm run dev
```

若在 Cursor 等环境启动失败（`electron.app` 为 `undefined`），多半是环境变量 `ELECTRON_RUN_AS_NODE=1`。`npm run dev` 已通过 `scripts/dev.sh` 自动 unset。

国内网络可保留根目录 `.npmrc` 中的 Electron 镜像配置。

```bash
npm run typecheck   # 类型检查
npm run test        # 单元测试
npm run build       # 构建
npm run dist        # 打包安装包
```

## 目录要点

```
electron/           # 主进程（窗口、IPC、modules）
src/features/       # 渲染层按功能划分
packages/shared/    # 跨进程类型与 IPC channel
config/             # changelog 等运行时配置
docs/               # 技术方案与产品规划
```

色板集中在 `src/shared/styles/tokens.css`，改肤只改此文件。

## 文档

- [技术方案](docs/技术方案.md)
- [智能体工作台规划](docs/产品规划-2.0-智能体工作台.md)
- [知识库技术方案](docs/知识库技术方案.md)

## 下载与仓库

- GitHub：https://github.com/lemo-ai/treasure-chest
- Releases 可附带 macOS DMG（如 `袖里乾坤-0.4.0-arm64.dmg`）

## License

当前为私有开发仓库（`UNLICENSED`）。开源协议待定。

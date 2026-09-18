# 袖里乾坤

[中文](README.zh-CN.md) | [English](README.en.md)

**袖里乾坤**是一款运行在本机的智能体工作台（仓库名 `treasure-chest`，英文短名 Qiankun）。左侧管理智能体与会话，中间对话协作，知识库沉淀资料，定时任务自动跑日报，工具箱覆盖日常效率与音视频文档处理——**无需注册登录，数据默认只留在本机**。

| 项 | 内容 |
|----|------|
| 当前版本 | **0.4.0** |
| 应用标识 | `com.lemo.treasure-chest` |
| 曾用名 | 百宝箱 |
| 仓库 | https://github.com/lemo-ai/treasure-chest |

---

## 产品定位

对标常见桌面 AI 工作台体验（对话壳、工具过程可见、Agent 可扩展），同时保留万年历、运势、股票、体彩等本机能力。

- **全程本机**：配置、会话、知识库、爬取数据落在本机用户目录
- **无账户体系**：不强制登录；仅在你配置的模型 / 数据源接口上发请求
- **密钥安全**：API Key 走操作系统安全存储，不进明文配置文件
- **可扩展**：自定义智能体、Skill、MCP、数据源、定时任务

> **免责声明**：AI 回复与运势、荐股、体彩分析仅供学习与娱乐参考，**不构成**投资、购彩、医疗或法律建议。爬虫请遵守目标站协议，勿高频抓取。

---

## 功能一览

### 1. 工作台（默认首页）

多智能体对话壳：

- 切换内置 / 自定义智能体；选择模型 Provider
- 工具调用过程可回看（搜索、抓取、知识库、数据源、编码沙箱等）
- **发送队列**：模型仍在回复时可继续输入，排队发送；支持单条移除与清空
- 可挂载：知识库引用（`@`）、联网检索、MCP、Skill、编码沙箱（Harness）
- 快捷问题、流式输出、会话管理

### 2. 智能体

| 内置 | 说明 |
|------|------|
| **直连模型** | 无领域人设；对话 + 通用工具 + 编码沙箱 |
| **今日运势** | 卦象 / 日运；天气等工具 |
| **股票参谋** | 行情检索、荐股报告、网页检索与抓取 |
| **体彩参谋** | 预装可编辑人设；默认绑定本机体彩 SQLite 数据源；含竞彩 / 北单等快捷提示 |

还可**添加自定义智能体**：人设、Logo、模型、MCP、知识库分区、数据源、Skill、快捷问题等。设置页可统一管理与删除。

### 3. 知识库（本机 RAG）

- 分区**树形结构**（最多约 5 层）：新建 / 重命名 / 删除；删除时可级联文档或移到默认分区
- 文档入库：文本、Markdown、Office、PDF、表格、常见图片等
- 切片存 SQLite；全文（FTS）与向量检索，支持 **hybrid** 混合
- Embedding：关闭 / 本地 hash / OpenAI / Ollama / OpenAI 兼容接口
- 向量库：默认本机 JSON；可选对接外部向量库
- 工作台对话可 `@知识库`；智能体侧有检索工具与引用溯源

### 4. 定时任务

卡片式管理，支持：

| 类型 | 作用 |
|------|------|
| 运势通知 | 推送今日运势 |
| 荐股报告 | 自动生成股票参谋报告 |
| 智能体回合 | 向指定智能体发送固定提示词（含体彩每日同步简报） |

- **触发方式**：单次、每天、固定间隔、时间窗内多次
- **运行上下文**（自定义任务）：模型、Skill、MCP、知识库、联网、数据源；报告 Markdown / HTML
- **结果投递**：工作台通知中心、系统桌面通知、钉钉机器人、SMTP 邮件（可按任务覆盖）
- 安装后默认带：运势、荐股、体彩等内置任务（可关可改）

### 5. 通知

收件箱查看定时任务与系统提醒的完整结果；未读角标；与钉钉 / 邮件通道配合使用。

### 6. 万年历

- 公历 / 农历 / 干支 / 宜忌
- 法定节假日与调休：**休** / **班** 标注
- 可在设置中开启**桌面挂件**独立窗

### 7. 工具箱

| 工具 | 能力摘要 |
|------|----------|
| 时间戳转换 | 秒 / 毫秒与标准时间互转 |
| 时区转换 | 跨时区换算 |
| 世界时间 | 主要城市当前时间（对照本地） |
| JSON 格式化 | 格式化 / 压缩 / 转义 |
| 网页爬虫 | 公开页正文 / 表格 / 链接；导出 CSV、XLSX、JSON、TXT；可与调度联动 |
| 图片工具 | 常规编辑 + 本机 ONNX（抠图、超分、去水印等）+ AI 生图 |
| 视频工具 | FFmpeg 剪辑转码、时间线、AI 生视频 |
| 音频工具 | FFmpeg 处理、AI 生音乐 / 转写等 |
| 文档工具 | 提取、Markdown、Office 互转、PDF 合并拆分加密等 |

### 8. 设置（节选）

- **模型与 API**：多 Provider 卡片；预设 OpenAI、火山方舟、阿里百炼、可灵、MiniMax 等；支持 OpenAI / Anthropic 协议及多模态
- **本地模型**：检测 / 启动 Ollama；系列安装；可同步到工作台；兼容 LM Studio 等本机环境
- **MCP**：stdio / SSE；预置 Memory、Sequential Thinking、Filesystem、Everything 等示例
- **数据源**：二十余种常见库与 HTTP / 文件源；按需装驱动、连接测试；预置体彩 SQLite；智能体可 `list` / `query`
- **技能（Skills）**：内置会议纪要、邮件润色、SWOT、代码解释、数据流水线、体彩数据源等；可从外部目录安装 `SKILL.md`
- **运势 / 股票**：生辰档案、市场开关、扫描池、每日自动生成等
- **常规**：语言（简体中文 / English）、主题色、开机自启、托盘、挂件、数据导出备份等

---

## 技术栈与架构

| 层 | 技术 |
|----|------|
| 桌面壳 | Electron 43、electron-vite、electron-builder |
| 界面 | React 19、TypeScript、Vite、Zustand、react-i18next |
| 本机数据 | better-sqlite3、FTS / 向量检索 |
| 媒体 | ffmpeg-static、onnxruntime-web 等 |

```
electron/           主进程：窗口、IPC、业务 modules（LLM、调度、知识库、股票等）
src/features/       渲染层：按功能分目录（workbench、knowledge、schedules、tools…）
packages/shared/    跨进程类型与 IPC channel
config/             运行时配置（如 changelog.json）
docs/               技术方案与产品规划
resources/          图标与打包资源
```

主题色板**只**维护在 `src/shared/styles/tokens.css`。

更完整的设计说明见：

- [技术方案](docs/技术方案.md)
- [智能体工作台规划](docs/产品规划-2.0-智能体工作台.md)
- [知识库技术方案](docs/知识库技术方案.md)

---

## 环境要求

- Node.js（建议当前 LTS）
- macOS / Windows / Linux（开发与打包目标见下）
- 可选：本机 Ollama（本地模型）、各类云端 API Key（按需）

---

## 开发

```bash
git clone https://github.com/lemo-ai/treasure-chest.git
cd treasure-chest
npm install
npm run dev
```

说明：

- `npm run dev` 走 `scripts/dev.sh`：会去掉 Cursor 等环境里常见的 `ELECTRON_RUN_AS_NODE=1`，避免 `electron.app` 为空
- 国内网络可保留根目录 `.npmrc` 中的 Electron 下载镜像
- `postinstall` 会同步 ONNX wasm 并修补开发态图标

### 常用命令

| 命令 | 作用 |
|------|------|
| `npm run typecheck` | 主进程 / 渲染 / shared 三端类型检查 |
| `npm run test` | Vitest 单元测试 |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |
| `npm run build` | 类型检查 + 生产构建 |
| `npm run pack` | 构建后打目录包（不生成安装程序） |
| `npm run dist` | 构建并生成安装包到 `release/` |
| `npm run harness` | 无头 Harness 自动化 |

### 打包产物（electron-builder）

| 平台 | 格式 | 架构 |
|------|------|------|
| macOS | DMG | x64、arm64 |
| Windows | NSIS（可选安装目录） | x64 |
| Linux | AppImage、deb | x64 |

输出目录：`release/`。例如：`袖里乾坤-0.4.0-arm64.dmg`。

---

## 版本与更新

应用内「版本变更」读取 `config/changelog.json`。发版时更新该文件即可同步中英文条目。

近期：

- **0.4.0**：体彩智能体、爬虫工具、工作台发送队列、数据源与联网增强
- **0.3.0**：定时调度、数据源、知识库分区树、MCP 预置、运势/股票收敛进工作台

---

## 隐私与数据

- 默认**不**把用户业务数据上传到本项目服务器（无此类后端）
- 仅向你在设置里配置的 AI / 向量 / 数据库等 endpoint 发起请求
- 本地库、会话、知识库文件位于应用 `userData` 目录；支持导出备份（见设置）

---

## 参与贡献

当前仓库以产品迭代为主。提交前建议：

```bash
npm run typecheck
npm run test
npm run lint
```

Issue / PR 请尽量说明：平台、版本号、复现步骤与期望行为。

---

## 许可证

当前为私有开发状态（`package.json` 中 `license: UNLICENSED`）。对外开源协议尚未选定，使用前请与维护者确认授权。

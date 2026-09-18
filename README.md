# 袖里乾坤

[中文](README.zh-CN.md) | [English](README.en.md)

**本机智能体工作台。** 多智能体对话、知识库增强、定时自动化与可扩展工具能力，数据默认留在本机，无需登录账号。

当前版本 **0.4.0** · [文档](docs/README.md) · [Releases](https://github.com/lemo-ai/treasure-chest/releases)

---

## 核心能力

### 智能体工作台

以对话为中心的工作台：切换内置或自定义智能体，流式回复，工具调用过程可回看。支持在回复进行中继续排队提问，适合连续协作，而不是「说一句等一句」。

内置 **直连模型 / 今日运势 / 股票参谋 / 体彩参谋**；也可自建智能体，绑定模型、人设、知识库、数据源与技能。

### 本机知识库

个人 RAG：分区树管理文档，切分入库后支持全文、向量与混合检索。对话中可引用知识库，回答可溯源到原文切片——适合把报告、资料和业务数据沉淀成本机上下文。

### 可扩展工具层

智能体可按需挂载：

- **联网检索与网页抓取** — 查资料、读页面、结构化导出  
- **数据源** — 连接本机或远程库表，供智能体查询分析（含预置业务库示例）  
- **MCP** — 接入标准 MCP 服务，扩展外部工具  
- **Skills** — 可复用的任务说明书（会议纪要、数据分析流水线等）  
- **编码沙箱** — 在受控环境下读改文件、执行命令，完成工程向任务  

### 定时调度与通知

卡片式定时任务：按天 / 间隔 / 时间窗触发运势提醒、荐股报告或任意智能体回合。结果进入应用内收件箱，并可投递系统通知、钉钉与邮件。

---

## 其它

万年历（含桌面挂件）、效率与音视频文档等工具箱能力随应用附带，服务日常使用，不改变「智能体工作台」主路径。

界面支持 **简体中文 / English**；主题与模型、通道等均在设置中配置。

> AI 与领域分析仅供参考，不构成投资、购彩或法律建议。

---

## 快速开始

```bash
git clone https://github.com/lemo-ai/treasure-chest.git
cd treasure-chest
npm install
npm run dev
```

| 命令 | 说明 |
|------|------|
| `npm run typecheck` | 类型检查 |
| `npm run test` | 测试 |
| `npm run dist` | 打包安装包至 `release/` |

支持 macOS（Intel / Apple Silicon）、Windows、Linux。详见 [架构说明](docs/架构说明.md)。

开发时若 Electron 异常（如 `electron.app` 为空），请使用 `npm run dev`（脚本会处理 `ELECTRON_RUN_AS_NODE`）。国内网络可保留仓库内 Electron 镜像配置。

---

## 技术概要

Electron · React · TypeScript · Vite · SQLite · Zustand · i18next

主进程承载 LLM 编排、知识库、调度与本机能力；渲染层按功能模块划分。完整说明见 [docs](docs/README.md)。

---

## 许可证

当前为私有开发仓库（`UNLICENSED`）。对外开源协议待定。

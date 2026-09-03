export type ChangelogLocale = 'zh-CN' | 'en-US'

export interface ChangelogRelease {
  version: string
  date: string
  title: Record<ChangelogLocale, string>
  items: Record<ChangelogLocale, string[]>
}

/** 版本变更页数据源；发版时在此追加最新一条。 */
export const CHANGELOG: ChangelogRelease[] = [
  {
    version: '0.2.0',
    date: '2026-09-03',
    title: {
      'zh-CN': '工作台 · 联网对话与供应商模型',
      'en-US': 'Workbench · live web chat & provider models',
    },
    items: {
      'zh-CN': [
        '直连会话与智能体拆分：直连默认聊天；股票/运势/自定义智能体才带领域人设与工具链',
        '工作台「联网」能力（默认开启）：搜索网页、解析公司代码、拉取行情后再回答；关闭即为纯模型',
        '对话流式输出：边生成边渲染；工具过程不塞进主气泡，完整轨迹仍可在「轨迹」面板查看',
        '模型与 API：按供应商管理；添加模型可用勾选声明图/视频等输入输出能力（不必再单独填媒体模型框）',
        '对话与智能体创建时，模型选择按供应商分组',
        '股票工具增强：中文公司名检索、A 股东财行情回退、网页抓取等，避免仅靠训练记忆误判上市状态',
        '思考态动画与更清晰的工作台能力栏',
        '打包产物：macOS DMG、Linux AppImage/deb；Windows 提供便携 zip',
      ],
      'en-US': [
        'Split direct chat from agents: plain chat by default; Fortune/Stocks/custom agents keep persona + tools',
        'Workbench “Web” toggle (on by default): search, resolve tickers, and fetch quotes before answering; off = raw model',
        'Token streaming in the composer bubble; tool details stay in Trajectory, not the main chat',
        'Models & API: per-provider configs; add models with modality checkboxes (image/video in/out) instead of separate media fields',
        'Chat and agent pickers group models by provider',
        'Stronger stock tooling: CN name lookup, Eastmoney quote fallback, page fetch — fewer false “unlisted” answers',
        'Thinking indicator and a clearer capability bar',
        'Packaging: macOS DMG, Linux AppImage/deb; Windows portable zip',
      ],
    },
  },
]

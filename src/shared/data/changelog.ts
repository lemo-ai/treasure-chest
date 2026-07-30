export type ChangelogLocale = 'zh-CN' | 'en-US'

export interface ChangelogRelease {
  version: string
  date: string
  title: Record<ChangelogLocale, string>
  items: Record<ChangelogLocale, string[]>
}

/** 导航栏「版本变更」面板数据源；发版时在此追加最新一条。 */
export const CHANGELOG: ChangelogRelease[] = [
  {
    version: '0.1.0',
    date: '2026-07-30',
    title: {
      'zh-CN': '首个可用版本',
      'en-US': 'First usable release',
    },
    items: {
      'zh-CN': [
        '万年历：公历/农历、宜忌与桌面圆形表盘挂件',
        '今日运势：生辰档案、卦象分析，支持多模型 AI 增强解读',
        '股票推荐：自选与扫描池、区间超额收益、资讯与 AI 报告',
        '股票走势：点击查看 K 线区间、悬停查看 OHLC 与涨跌幅',
        '设置：主题/语言、开机自启、通知、备份导入导出',
        '应用图标与品牌标识焕新',
      ],
      'en-US': [
        'Calendar: solar/lunar dates, almanac, and desktop dial widget',
        'Fortune: birth profile, hexagram analysis, multi-provider AI insights',
        'Stocks: watchlist & scanner, excess returns, news, and AI reports',
        'Stock trends: range charts with hover OHLC and percent change',
        'Settings: theme/locale, launch at login, notifications, backup',
        'Refreshed app icon and brand mark',
      ],
    },
  },
]

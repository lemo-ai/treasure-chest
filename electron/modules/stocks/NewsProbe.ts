import type { StockMarket } from '@shared'
import { logger } from '../../utils/logger'

/**
 * Lightweight news sentiment probe for scanner pass-2.
 * Uses Google News RSS only (fast, no API key) — full multi-source stays in StocksService.
 */
export async function probeNewsSentimentScore(item: {
  market: StockMarket
  symbol: string
  name?: string
}): Promise<number> {
  const queryParts =
    item.market === 'CN'
      ? [item.symbol.replace(/\.(SH|SZ)$/i, ''), item.name, '股票'].filter(Boolean)
      : [item.symbol, item.name, 'stock'].filter(Boolean)
  const q = encodeURIComponent(queryParts.join(' '))
  const url =
    item.market === 'CN'
      ? `https://news.google.com/rss/search?q=${q}&hl=zh-CN&gl=CN&ceid=CN:zh-Hans`
      : `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'TreasureChest/0.1 (scanner-news-probe)' },
      signal: AbortSignal.timeout(12_000),
    })
    if (!res.ok) return 0
    const xml = await res.text()
    const titles = [...xml.matchAll(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/g)]
      .map((m) => (m[1] || m[2] || '').trim())
      .filter((t) => t && !/^Google\s+News/i.test(t))
      .slice(0, 8)

    if (!titles.length) return 0

    const pos =
      item.market === 'CN'
        ? /涨|利好|增长|突破|创新高|回购|中标|签约|盈利/
        : /surge|rally|beat|record|upgrade|buy|growth|profit/
    const neg =
      item.market === 'CN'
        ? /跌|利空|下滑|亏损|调查|处罚|减持|暴雷|退市/
        : /plunge|miss|downgrade|probe|lawsuit|loss|cut|fraud/

    let score = 0
    for (const title of titles) {
      if (pos.test(title)) score += 1.2
      if (neg.test(title)) score -= 1.4
    }
    return Math.max(-6, Math.min(6, score))
  } catch (err) {
    logger.warn(`news probe failed ${item.market}:${item.symbol}`, err)
    return 0
  }
}

import type { ScannerPoolItem, StockMarket, StocksPriceRanges } from '@shared'
import { settingsStore } from '../settings/SettingsStore'
import { getQuoteSnapshot } from './PriceRangeService'
import { probeNewsSentimentScore } from './NewsProbe'
import { stocksStore } from './StocksStore'
import { logger } from '../../utils/logger'

/** Expanded seed universe for momentum + quality screening (not final picks). */
const SCAN_UNIVERSE: Record<StockMarket, Array<{ symbol: string; name: string; sector?: string }>> = {
  CN: [
    { symbol: '600519.SH', name: '贵州茅台', sector: '消费' },
    { symbol: '000858.SZ', name: '五粮液', sector: '消费' },
    { symbol: '000568.SZ', name: '泸州老窖', sector: '消费' },
    { symbol: '600809.SH', name: '山西汾酒', sector: '消费' },
    { symbol: '300750.SZ', name: '宁德时代', sector: '新能源' },
    { symbol: '002594.SZ', name: '比亚迪', sector: '新能源' },
    { symbol: '601012.SH', name: '隆基绿能', sector: '新能源' },
    { symbol: '300274.SZ', name: '阳光电源', sector: '新能源' },
    { symbol: '601318.SH', name: '中国平安', sector: '金融' },
    { symbol: '600036.SH', name: '招商银行', sector: '金融' },
    { symbol: '601166.SH', name: '兴业银行', sector: '金融' },
    { symbol: '600030.SH', name: '中信证券', sector: '金融' },
    { symbol: '000333.SZ', name: '美的集团', sector: '制造' },
    { symbol: '000651.SZ', name: '格力电器', sector: '制造' },
    { symbol: '600900.SH', name: '长江电力', sector: '公用' },
    { symbol: '601088.SH', name: '中国神华', sector: '能源' },
    { symbol: '600028.SH', name: '中国石化', sector: '能源' },
    { symbol: '688981.SH', name: '中芯国际', sector: '半导体' },
    { symbol: '002371.SZ', name: '北方华创', sector: '半导体' },
    { symbol: '603501.SH', name: '韦尔股份', sector: '半导体' },
    { symbol: '300059.SZ', name: '东方财富', sector: '金融科技' },
    { symbol: '002475.SZ', name: '立讯精密', sector: '电子' },
    { symbol: '002415.SZ', name: '海康威视', sector: '电子' },
    { symbol: '600276.SH', name: '恒瑞医药', sector: '医药' },
    { symbol: '300760.SZ', name: '迈瑞医疗', sector: '医药' },
    { symbol: '603259.SH', name: '药明康德', sector: '医药' },
    { symbol: '601899.SH', name: '紫金矿业', sector: '资源' },
    { symbol: '600887.SH', name: '伊利股份', sector: '消费' },
    { symbol: '000001.SZ', name: '平安银行', sector: '金融' },
    { symbol: '601127.SH', name: '赛力斯', sector: '汽车' },
  ],
  US: [
    { symbol: 'AAPL', name: 'Apple', sector: 'Tech' },
    { symbol: 'MSFT', name: 'Microsoft', sector: 'Tech' },
    { symbol: 'NVDA', name: 'NVIDIA', sector: 'Semi' },
    { symbol: 'AMZN', name: 'Amazon', sector: 'Consumer' },
    { symbol: 'META', name: 'Meta', sector: 'Tech' },
    { symbol: 'GOOGL', name: 'Alphabet', sector: 'Tech' },
    { symbol: 'TSLA', name: 'Tesla', sector: 'Auto' },
    { symbol: 'AVGO', name: 'Broadcom', sector: 'Semi' },
    { symbol: 'AMD', name: 'AMD', sector: 'Semi' },
    { symbol: 'JPM', name: 'JPMorgan', sector: 'Finance' },
    { symbol: 'V', name: 'Visa', sector: 'Finance' },
    { symbol: 'MA', name: 'Mastercard', sector: 'Finance' },
    { symbol: 'LLY', name: 'Eli Lilly', sector: 'Health' },
    { symbol: 'UNH', name: 'UnitedHealth', sector: 'Health' },
    { symbol: 'XOM', name: 'Exxon', sector: 'Energy' },
    { symbol: 'CVX', name: 'Chevron', sector: 'Energy' },
    { symbol: 'COST', name: 'Costco', sector: 'Retail' },
    { symbol: 'WMT', name: 'Walmart', sector: 'Retail' },
    { symbol: 'NFLX', name: 'Netflix', sector: 'Media' },
    { symbol: 'CRM', name: 'Salesforce', sector: 'Software' },
    { symbol: 'ORCL', name: 'Oracle', sector: 'Software' },
    { symbol: 'ADBE', name: 'Adobe', sector: 'Software' },
    { symbol: 'INTC', name: 'Intel', sector: 'Semi' },
    { symbol: 'QCOM', name: 'Qualcomm', sector: 'Semi' },
    { symbol: 'BA', name: 'Boeing', sector: 'Industrial' },
    { symbol: 'CAT', name: 'Caterpillar', sector: 'Industrial' },
    { symbol: 'GS', name: 'Goldman Sachs', sector: 'Finance' },
    { symbol: 'DIS', name: 'Disney', sector: 'Media' },
  ],
}

const BENCHMARK: Record<StockMarket, { symbol: string; name: string }> = {
  CN: { symbol: '000300.SS', name: '沪深300' },
  US: { symbol: 'SPY', name: 'S&P 500 ETF' },
}

function scoreMomentum(ranges: StocksPriceRanges): number {
  const spikePenalty = Math.abs(ranges.d1) > 8 ? -Math.abs(ranges.d1) * 0.35 : 0
  return ranges.d1 * 0.25 + ranges.w1 * 0.35 + ranges.m1 * 0.25 + ranges.m3 * 0.15 + spikePenalty
}

function scoreRelativeStrength(stock: StocksPriceRanges, bench: StocksPriceRanges): number {
  const excessW = stock.w1 - bench.w1
  const excessM = stock.m1 - bench.m1
  return excessW * 0.6 + excessM * 0.4
}

/** Volume trend: recent 5d avg vs prior 20d avg. */
function scoreVolumeTrend(bars: Array<{ volume?: number }>): number {
  const vols = bars
    .map((b) => b.volume)
    .filter((v): v is number => typeof v === 'number' && v > 0)
  if (vols.length < 15) return 0
  const recent = vols.slice(-5)
  const prior = vols.slice(-25, -5)
  if (!prior.length) return 0
  const rAvg = recent.reduce((a, b) => a + b, 0) / recent.length
  const pAvg = prior.reduce((a, b) => a + b, 0) / prior.length
  if (!pAvg) return 0
  const ratio = rAvg / pAvg
  // Prefer rising participation without extreme blow-off
  if (ratio > 2.5) return 2
  if (ratio > 1.3) return 6
  if (ratio > 1.05) return 3
  if (ratio < 0.7) return -3
  return 0
}

export interface ScannerRefreshResult {
  ok: boolean
  added: number
  scanned: number
  errors: string[]
  items: ScannerPoolItem[]
  /** Pipeline diagnostics for UI */
  meta?: {
    benchmarks: Partial<Record<StockMarket, StocksPriceRanges>>
    newsProbed: number
  }
}

/**
 * Two-pass industry-style scanner:
 * 1) Momentum + relative strength + volume over expanded universe
 * 2) News sentiment probe on top candidates, re-rank into scanner pool
 */
export async function refreshScannerPool(): Promise<ScannerRefreshResult> {
  const cfg = settingsStore.getStocksSettings()
  const markets: StockMarket[] = []
  if (cfg.marketCN) markets.push('CN')
  if (cfg.marketUS) markets.push('US')
  if (!markets.length) {
    return { ok: false, added: 0, scanned: 0, errors: ['no markets enabled'], items: [] }
  }

  const perMarket = Math.max(3, Math.ceil(cfg.scannerMax / markets.length))
  const errors: string[] = []
  let scanned = 0
  let newsProbed = 0
  const benchmarks: Partial<Record<StockMarket, StocksPriceRanges>> = {}
  const picked: Array<{
    market: StockMarket
    symbol: string
    name: string
    sector?: string
    score: number
    mom: number
    rs: number
    vol: number
    news: number
  }> = []

  for (const market of markets) {
    let benchRanges: StocksPriceRanges = { d1: 0, w1: 0, m1: 0, m3: 0, m6: 0, ytd: 0, y1: 0 }
    try {
      const bench = await getQuoteSnapshot({ market, symbol: BENCHMARK[market].symbol })
      benchRanges = bench.ranges
      benchmarks[market] = benchRanges
    } catch (err) {
      errors.push(
        `benchmark ${market}:${BENCHMARK[market].symbol}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    const ranked: typeof picked = []
    for (const cand of SCAN_UNIVERSE[market]) {
      scanned += 1
      try {
        const quote = await getQuoteSnapshot({ market, symbol: cand.symbol })
        const mom = scoreMomentum(quote.ranges)
        const rs = scoreRelativeStrength(quote.ranges, benchRanges)
        const vol = scoreVolumeTrend(quote.bars)
        const score = mom + rs * 0.45 + vol
        ranked.push({
          market,
          symbol: cand.symbol,
          name: cand.name,
          sector: cand.sector,
          score,
          mom,
          rs,
          vol,
          news: 0,
        })
      } catch (err) {
        errors.push(`${market}:${cand.symbol}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    ranked.sort((a, b) => b.score - a.score)
    const shortlist = ranked.slice(0, Math.min(ranked.length, perMarket * 2))

    // Pass 2: news probe on shortlist (industry: don't hammer every ticker)
    await Promise.all(
      shortlist.map(async (hit) => {
        try {
          const news = await probeNewsSentimentScore({
            market: hit.market,
            symbol: hit.symbol,
            name: hit.name,
          })
          newsProbed += 1
          hit.news = news
          hit.score += news
        } catch {
          /* ignore news failures */
        }
      }),
    )

    shortlist.sort((a, b) => b.score - a.score)
    for (const hit of shortlist.slice(0, perMarket)) {
      picked.push(hit)
    }
  }

  const existing = stocksStore.getScannerPool()
  for (const item of existing) {
    if (markets.includes(item.market)) {
      stocksStore.removeScannerPoolItem(item.market, item.symbol)
    }
  }

  const items: ScannerPoolItem[] = []
  for (const hit of picked.slice(0, cfg.scannerMax)) {
    const label = [
      hit.name,
      hit.sector,
      `s=${hit.score.toFixed(1)}`,
      `m=${hit.mom.toFixed(1)}`,
      `rs=${hit.rs.toFixed(1)}`,
      hit.news !== 0 ? `n=${hit.news.toFixed(1)}` : null,
    ]
      .filter(Boolean)
      .join(' · ')
    items.push(
      stocksStore.upsertScannerPoolItem({
        market: hit.market,
        symbol: hit.symbol,
        name: label,
      }),
    )
  }

  logger.info(
    `scanner refresh scanned=${scanned} added=${items.length} newsProbed=${newsProbed} errors=${errors.length}`,
  )
  return {
    ok: true,
    added: items.length,
    scanned,
    errors,
    items,
    meta: { benchmarks, newsProbed },
  }
}

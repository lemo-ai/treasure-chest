import type { ScannerPoolItem, StockMarket } from '@shared'
import { settingsStore } from '../settings/SettingsStore'
import { getQuoteSnapshot } from './PriceRangeService'
import { stocksStore } from './StocksStore'
import { logger } from '../../utils/logger'

/** Expanded seed universe for momentum screening (not final picks). */
const SCAN_UNIVERSE: Record<StockMarket, Array<{ symbol: string; name: string }>> = {
  CN: [
    { symbol: '600519.SH', name: '贵州茅台' },
    { symbol: '000858.SZ', name: '五粮液' },
    { symbol: '300750.SZ', name: '宁德时代' },
    { symbol: '601318.SH', name: '中国平安' },
    { symbol: '600036.SH', name: '招商银行' },
    { symbol: '000333.SZ', name: '美的集团' },
    { symbol: '002594.SZ', name: '比亚迪' },
    { symbol: '600900.SH', name: '长江电力' },
    { symbol: '601012.SH', name: '隆基绿能' },
    { symbol: '688981.SH', name: '中芯国际' },
    { symbol: '300059.SZ', name: '东方财富' },
    { symbol: '002475.SZ', name: '立讯精密' },
  ],
  US: [
    { symbol: 'AAPL', name: 'Apple' },
    { symbol: 'MSFT', name: 'Microsoft' },
    { symbol: 'NVDA', name: 'NVIDIA' },
    { symbol: 'AMZN', name: 'Amazon' },
    { symbol: 'META', name: 'Meta' },
    { symbol: 'GOOGL', name: 'Alphabet' },
    { symbol: 'TSLA', name: 'Tesla' },
    { symbol: 'AVGO', name: 'Broadcom' },
    { symbol: 'JPM', name: 'JPMorgan' },
    { symbol: 'LLY', name: 'Eli Lilly' },
    { symbol: 'XOM', name: 'Exxon' },
    { symbol: 'COST', name: 'Costco' },
  ],
}

function scoreMomentum(ranges: { d1: number; w1: number; m1: number; m3: number }): number {
  // Prefer positive short/medium momentum with mild mean-reversion penalty on extreme 1D spikes.
  const spikePenalty = Math.abs(ranges.d1) > 8 ? -Math.abs(ranges.d1) * 0.3 : 0
  return ranges.d1 * 0.35 + ranges.w1 * 0.4 + ranges.m1 * 0.2 + ranges.m3 * 0.05 + spikePenalty
}

export interface ScannerRefreshResult {
  ok: boolean
  added: number
  scanned: number
  errors: string[]
  items: ScannerPoolItem[]
}

/**
 * Refresh scanner pool by scoring a seed universe with live/cached quotes.
 * Replaces previous auto-generated entries for enabled markets (keeps manually noted names).
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
  const picked: Array<{ market: StockMarket; symbol: string; name: string; score: number }> = []

  for (const market of markets) {
    const ranked: Array<{ symbol: string; name: string; score: number }> = []
    for (const cand of SCAN_UNIVERSE[market]) {
      scanned += 1
      try {
        const quote = await getQuoteSnapshot({ market, symbol: cand.symbol })
        const score = scoreMomentum(quote.ranges)
        ranked.push({ symbol: cand.symbol, name: cand.name, score })
      } catch (err) {
        errors.push(`${market}:${cand.symbol}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    ranked.sort((a, b) => b.score - a.score)
    for (const hit of ranked.slice(0, perMarket)) {
      picked.push({ market, ...hit })
    }
  }

  // Clear existing scanner pool for enabled markets, then write fresh picks.
  const existing = stocksStore.getScannerPool()
  for (const item of existing) {
    if (markets.includes(item.market)) {
      stocksStore.removeScannerPoolItem(item.market, item.symbol)
    }
  }

  const items: ScannerPoolItem[] = []
  for (const hit of picked.slice(0, cfg.scannerMax)) {
    items.push(
      stocksStore.upsertScannerPoolItem({
        market: hit.market,
        symbol: hit.symbol,
        name: `${hit.name} · mom ${hit.score.toFixed(1)}`,
      }),
    )
  }

  logger.info(`scanner refresh scanned=${scanned} added=${items.length} errors=${errors.length}`)
  return { ok: true, added: items.length, scanned, errors, items }
}

import type { OhlcBar, StockMarket, StocksPriceRanges, WatchlistItem } from '@shared'
import { getDb } from '../../db/Database'
import { logger } from '../../utils/logger'

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function todayYmd(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function toYahooSymbol(item: { market: StockMarket; symbol: string }): string {
  if (item.market === 'US') return item.symbol
  if (item.symbol.endsWith('.SH')) return item.symbol.replace('.SH', '.SS')
  if (item.symbol.endsWith('.SZ')) return item.symbol
  // benchmark helpers like 000300.SS already Yahoo-ready
  return item.symbol
}

function rangePctByBars(bars: OhlcBar[], tradingDays: number): number {
  if (bars.length < 2) return 0
  const end = bars[bars.length - 1]!.close
  const startIndex = Math.max(0, bars.length - 1 - tradingDays)
  const start = bars[startIndex]!.close
  if (!start) return 0
  return ((end - start) / start) * 100
}

function rangePctYtd(bars: OhlcBar[]): number {
  if (bars.length < 2) return 0
  const year = bars[bars.length - 1]!.date.slice(0, 4)
  const first = bars.find((b) => b.date.startsWith(year))
  const end = bars[bars.length - 1]!.close
  const start = first?.close ?? bars[0]!.close
  if (!start) return 0
  return ((end - start) / start) * 100
}

export function computePriceRanges(bars: OhlcBar[]): StocksPriceRanges {
  return {
    d1: rangePctByBars(bars, 1),
    w1: rangePctByBars(bars, 5),
    m1: rangePctByBars(bars, 22),
    m3: rangePctByBars(bars, 66),
    m6: rangePctByBars(bars, 132),
    ytd: rangePctYtd(bars),
    y1: rangePctByBars(bars, 252),
  }
}

export function computeSparkline(bars: OhlcBar[], points = 30): number[] {
  const closes = bars.map((b) => b.close)
  if (closes.length <= points) return closes
  const step = Math.ceil(closes.length / points)
  return closes.filter((_, i) => i === closes.length - 1 || i % step === 0).slice(-points)
}

function emptyRanges(): StocksPriceRanges {
  return { d1: 0, w1: 0, m1: 0, m3: 0, m6: 0, ytd: 0, y1: 0 }
}

function readCachedBars(market: StockMarket, symbol: string): OhlcBar[] {
  const rows = getDb()
    .prepare(
      `SELECT date, open, high, low, close, volume
       FROM stocks_daily_bars
       WHERE market = ? AND symbol = ?
       ORDER BY date ASC`,
    )
    .all(market, symbol) as Array<{
    date: string
    open: number | null
    high: number | null
    low: number | null
    close: number
    volume: number | null
  }>
  return rows.map((r) => ({
    date: r.date,
    open: r.open ?? r.close,
    high: r.high ?? r.close,
    low: r.low ?? r.close,
    close: r.close,
    volume: r.volume ?? undefined,
  }))
}

function readMeta(market: StockMarket, symbol: string): { currency: string | null; fetchedAt: string | null } {
  const row = getDb()
    .prepare('SELECT currency, fetched_at FROM stocks_bar_meta WHERE market = ? AND symbol = ?')
    .get(market, symbol) as { currency: string | null; fetched_at: string } | undefined
  return { currency: row?.currency ?? null, fetchedAt: row?.fetched_at ?? null }
}

function upsertBars(market: StockMarket, symbol: string, bars: OhlcBar[], currency: string): void {
  const db = getDb()
  const insert = db.prepare(
    `INSERT INTO stocks_daily_bars (market, symbol, date, open, high, low, close, volume)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(market, symbol, date) DO UPDATE SET
       open = excluded.open,
       high = excluded.high,
       low = excluded.low,
       close = excluded.close,
       volume = excluded.volume`,
  )
  const meta = db.prepare(
    `INSERT INTO stocks_bar_meta (market, symbol, currency, fetched_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(market, symbol) DO UPDATE SET
       currency = excluded.currency,
       fetched_at = excluded.fetched_at`,
  )
  const tx = db.transaction(() => {
    for (const bar of bars) {
      insert.run(market, symbol, bar.date, bar.open, bar.high, bar.low, bar.close, bar.volume ?? null)
    }
    meta.run(market, symbol, currency, new Date().toISOString())
  })
  tx()
}

function isCacheFresh(bars: OhlcBar[], fetchedAt: string | null): boolean {
  if (bars.length < 60 || !fetchedAt) return false
  const lastDate = bars[bars.length - 1]!.date
  const today = todayYmd()
  // Fresh if last bar is today, or fetched today with last bar within 4 calendar days (weekend/holiday).
  if (lastDate === today) return true
  const fetchedDay = fetchedAt.slice(0, 10)
  if (fetchedDay !== today) return false
  const last = new Date(lastDate)
  const now = new Date(today)
  const diffDays = Math.floor((now.getTime() - last.getTime()) / 86_400_000)
  return diffDays <= 4
}

async function fetchYahooDailyBars(item: { market: StockMarket; symbol: string }): Promise<{
  bars: OhlcBar[]
  currency: string
}> {
  const symbol = encodeURIComponent(toYahooSymbol(item))
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=2y&interval=1d`
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`quote ${item.symbol} http ${resp.status}`)
  const json = (await resp.json()) as any
  const result = json?.chart?.result?.[0]
  const timestamps = (result?.timestamp ?? []) as number[]
  const quote = result?.indicators?.quote?.[0] ?? {}
  const opens = (quote.open ?? []) as Array<number | null>
  const highs = (quote.high ?? []) as Array<number | null>
  const lows = (quote.low ?? []) as Array<number | null>
  const closes = (quote.close ?? []) as Array<number | null>
  const volumes = (quote.volume ?? []) as Array<number | null>
  const bars: OhlcBar[] = []
  for (let i = 0; i < timestamps.length; i++) {
    const close = closes[i]
    if (typeof close !== 'number' || !Number.isFinite(close)) continue
    const ts = timestamps[i]!
    const d = new Date(ts * 1000)
    const date = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
    bars.push({
      date,
      open: typeof opens[i] === 'number' ? opens[i]! : close,
      high: typeof highs[i] === 'number' ? highs[i]! : close,
      low: typeof lows[i] === 'number' ? lows[i]! : close,
      close,
      volume: typeof volumes[i] === 'number' ? volumes[i]! : undefined,
    })
  }
  if (bars.length === 0) throw new Error(`no bars for ${item.symbol}`)
  const currency =
    typeof result?.meta?.currency === 'string'
      ? result.meta.currency
      : item.market === 'US'
        ? 'USD'
        : 'CNY'
  return { bars, currency }
}

export interface QuoteSnapshot {
  price: number
  currency: string
  ranges: StocksPriceRanges
  sparkline: number[]
  fromCache: boolean
  bars: OhlcBar[]
}

export async function getQuoteSnapshot(item: WatchlistItem | { market: StockMarket; symbol: string }): Promise<QuoteSnapshot> {
  const market = item.market
  const symbol = item.symbol
  const cached = readCachedBars(market, symbol)
  const meta = readMeta(market, symbol)

  if (isCacheFresh(cached, meta.fetchedAt)) {
    return {
      price: cached[cached.length - 1]!.close,
      currency: meta.currency ?? (market === 'US' ? 'USD' : 'CNY'),
      ranges: computePriceRanges(cached),
      sparkline: computeSparkline(cached),
      fromCache: true,
      bars: cached,
    }
  }

  try {
    const remote = await fetchYahooDailyBars({ market, symbol })
    upsertBars(market, symbol, remote.bars, remote.currency)
    return {
      price: remote.bars[remote.bars.length - 1]!.close,
      currency: remote.currency,
      ranges: computePriceRanges(remote.bars),
      sparkline: computeSparkline(remote.bars),
      fromCache: false,
      bars: remote.bars,
    }
  } catch (err) {
    if (cached.length >= 2) {
      logger.warn(`quote fetch failed, using stale cache for ${market}:${symbol}`, err)
      return {
        price: cached[cached.length - 1]!.close,
        currency: meta.currency ?? (market === 'US' ? 'USD' : 'CNY'),
        ranges: computePriceRanges(cached),
        sparkline: computeSparkline(cached),
        fromCache: true,
        bars: cached,
      }
    }
    throw err
  }
}

export function zeroRanges(): StocksPriceRanges {
  return emptyRanges()
}

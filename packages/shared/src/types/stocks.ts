export type StockMarket = 'CN' | 'US'

export interface WatchlistItem {
  market: StockMarket
  symbol: string
  name?: string
  note?: string
  enabled: boolean
  updatedAt: string
}

export interface ScannerPoolItem {
  market: StockMarket
  symbol: string
  name?: string
  enabled: boolean
  updatedAt: string
}

export type RecommendationSignal = 'buy' | 'watch' | 'avoid'

export type StocksRangeKey = 'd1' | 'w1' | 'm1' | 'm3' | 'm6' | 'ytd' | 'y1'

export const ALL_STOCKS_RANGE_KEYS: StocksRangeKey[] = ['d1', 'w1', 'm1', 'm3', 'm6', 'ytd', 'y1']

/** English short labels (UI should prefer i18n `stocks.range.*`). */
export const STOCKS_RANGE_LABELS: Record<StocksRangeKey, string> = {
  d1: '1D',
  w1: '1W',
  m1: '1M',
  m3: '3M',
  m6: '6M',
  ytd: 'YTD',
  y1: '1Y',
}

export interface StocksPriceRanges {
  d1: number
  w1: number
  m1: number
  m3: number
  m6: number
  ytd: number
  y1: number
}

export interface StocksSettings {
  /** Analyze A-shares when true. */
  marketCN: boolean
  /** Analyze US stocks when true. */
  marketUS: boolean
  /** Auto-generate daily report while the app is running. */
  autoGenerate: boolean
  /** Local hour (0–23) to run auto generation. */
  autoGenerateHour: number
  /** Max scanner-pool symbols sent into daily analysis. */
  scannerMax: number
  /** Cap on recommendations kept in the final report. */
  maxRecommendations: number
  /** Default range keys shown / preferred for analysis. */
  defaultRanges: StocksRangeKey[]
}

export const DEFAULT_STOCKS_SETTINGS: StocksSettings = {
  marketCN: true,
  marketUS: true,
  autoGenerate: false,
  autoGenerateHour: 10,
  scannerMax: 20,
  maxRecommendations: 15,
  defaultRanges: ['d1', 'w1', 'm1', 'm3', 'm6', 'ytd'],
}

export interface StockRecommendation {
  market: StockMarket
  symbol: string
  name?: string
  source: 'watchlist' | 'scanner' | 'both'
  score: number
  signal: RecommendationSignal
  price: number
  currency: string
  ranges: StocksPriceRanges
  /** Recent closes for sparkline (newest last); optional for older reports. */
  sparkline?: number[]
  /** True when ranges came from local SQLite bar cache. */
  fromCache?: boolean
  benchmark: {
    symbol: string
    ranges: StocksPriceRanges
    excess: StocksPriceRanges
  }
  news: Array<{
    title: string
    url: string
    sentiment: 'positive' | 'negative' | 'neutral'
    /** Origin outlet used for multi-source aggregation. */
    source?:
      | 'eastmoney'
      | 'sina'
      | 'wallstreetcn'
      | 'google'
      | 'yahoo'
      | 'nasdaq'
      | 'seekingalpha'
      | 'announcement'
  }>
  /** What the company does / business overview. */
  companyIntro?: string
  /** Short market / price outlook (informational, not advice). */
  outlook?: string
  summary: string
  reasons: string[]
  risks: string[]
}

export interface StocksReport {
  date: string
  generatedAt: string
  recommendations: StockRecommendation[]
  disclaimer: string
  /** Per-market open/closed status for the report date. */
  marketStatus?: {
    CN: { open: boolean; reason?: string }
    US: { open: boolean; reason?: string }
  }
  source: {
    engine: string
    aiEnhanced: boolean
    status: {
      total: number
      quoteFallbackCount: number
      newsHitCount: number
      cacheHitCount: number
      ai: 'disabled' | 'success' | 'fallback'
    }
  }
}

export interface StocksReportSummary {
  date: string
  generatedAt: string
  count: number
  aiEnhanced: boolean
}

export interface OhlcBar {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume?: number
}

/** Quote + bars for the stock trend detail panel. */
export interface StockQuoteDetail {
  market: StockMarket
  symbol: string
  name?: string
  price: number
  currency: string
  ranges: StocksPriceRanges
  sparkline: number[]
  bars: OhlcBar[]
  fromCache: boolean
}

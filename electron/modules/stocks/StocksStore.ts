import type { ScannerPoolItem, StocksReport, StocksReportSummary, StockMarket, WatchlistItem } from '@shared'
import { getDb } from '../../db/Database'

function normSymbol(symbol: string): string {
  return symbol.trim().toUpperCase()
}

export type CompanyProfileSource = 'yahoo' | 'ai' | 'fallback'

export interface CompanyProfileRecord {
  market: StockMarket
  symbol: string
  name?: string
  companyIntro: string
  source: CompanyProfileSource
  updatedAt: string
}

export const stocksStore = {
  getWatchlist(): WatchlistItem[] {
    const rows = getDb()
      .prepare('SELECT data FROM stocks_watchlist ORDER BY updated_at DESC')
      .all() as Array<{ data: string }>
    return rows
      .map((row) => {
        try {
          return JSON.parse(row.data) as WatchlistItem
        } catch {
          return null
        }
      })
      .filter((item): item is WatchlistItem => Boolean(item))
  },

  upsertWatchlistItem(input: { market: StockMarket; symbol: string; name?: string; note?: string }): WatchlistItem {
    const next: WatchlistItem = {
      market: input.market,
      symbol: normSymbol(input.symbol),
      name: input.name?.trim() || undefined,
      note: input.note?.trim() || undefined,
      enabled: true,
      updatedAt: new Date().toISOString(),
    }
    getDb()
      .prepare(
        `INSERT INTO stocks_watchlist (market, symbol, data, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(market, symbol) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      )
      .run(next.market, next.symbol, JSON.stringify(next), next.updatedAt)
    return next
  },

  removeWatchlistItem(market: StockMarket, symbol: string): void {
    getDb().prepare('DELETE FROM stocks_watchlist WHERE market = ? AND symbol = ?').run(market, normSymbol(symbol))
  },

  getScannerPool(): ScannerPoolItem[] {
    const rows = getDb()
      .prepare('SELECT data FROM stocks_scanner_pool ORDER BY updated_at DESC')
      .all() as Array<{ data: string }>
    return rows
      .map((row) => {
        try {
          return JSON.parse(row.data) as ScannerPoolItem
        } catch {
          return null
        }
      })
      .filter((item): item is ScannerPoolItem => Boolean(item))
  },

  upsertScannerPoolItem(input: { market: StockMarket; symbol: string; name?: string }): ScannerPoolItem {
    const next: ScannerPoolItem = {
      market: input.market,
      symbol: normSymbol(input.symbol),
      name: input.name?.trim() || undefined,
      enabled: true,
      updatedAt: new Date().toISOString(),
    }
    getDb()
      .prepare(
        `INSERT INTO stocks_scanner_pool (market, symbol, data, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(market, symbol) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      )
      .run(next.market, next.symbol, JSON.stringify(next), next.updatedAt)
    return next
  },

  removeScannerPoolItem(market: StockMarket, symbol: string): void {
    getDb().prepare('DELETE FROM stocks_scanner_pool WHERE market = ? AND symbol = ?').run(market, normSymbol(symbol))
  },

  saveReport(report: StocksReport): void {
    getDb()
      .prepare(
        `INSERT INTO stocks_reports (date, data, generated_at) VALUES (?, ?, ?)
         ON CONFLICT(date) DO UPDATE SET data = excluded.data, generated_at = excluded.generated_at`,
      )
      .run(report.date, JSON.stringify(report), report.generatedAt)
  },

  getLatestReport(): StocksReport | null {
    const row = getDb()
      .prepare('SELECT data FROM stocks_reports ORDER BY generated_at DESC LIMIT 1')
      .get() as { data: string } | undefined
    if (!row) return null
    try {
      return JSON.parse(row.data) as StocksReport
    } catch {
      return null
    }
  },

  getReportByDate(date: string): StocksReport | null {
    const row = getDb()
      .prepare('SELECT data FROM stocks_reports WHERE date = ?')
      .get(date) as { data: string } | undefined
    if (!row) return null
    try {
      return JSON.parse(row.data) as StocksReport
    } catch {
      return null
    }
  },

  listReports(limit = 30): StocksReportSummary[] {
    const rows = getDb()
      .prepare('SELECT date, generated_at, data FROM stocks_reports ORDER BY date DESC LIMIT ?')
      .all(Math.max(1, Math.min(limit, 90))) as Array<{ date: string; generated_at: string; data: string }>
    return rows.map((row) => {
      let count = 0
      let aiEnhanced = false
      try {
        const parsed = JSON.parse(row.data) as StocksReport
        count = parsed.recommendations?.length ?? 0
        aiEnhanced = Boolean(parsed.source?.aiEnhanced)
      } catch {
        /* ignore */
      }
      return {
        date: row.date,
        generatedAt: row.generated_at,
        count,
        aiEnhanced,
      }
    })
  },

  getCompanyProfile(market: StockMarket, symbol: string): CompanyProfileRecord | null {
    const row = getDb()
      .prepare('SELECT market, symbol, name, company_intro, source, updated_at FROM stocks_company_profiles WHERE market = ? AND symbol = ?')
      .get(market, normSymbol(symbol)) as
      | {
          market: StockMarket
          symbol: string
          name: string | null
          company_intro: string
          source: string
          updated_at: string
        }
      | undefined
    if (!row) return null
    const source: CompanyProfileSource =
      row.source === 'ai' || row.source === 'yahoo' || row.source === 'fallback' ? row.source : 'fallback'
    return {
      market: row.market,
      symbol: row.symbol,
      name: row.name || undefined,
      companyIntro: row.company_intro,
      source,
      updatedAt: row.updated_at,
    }
  },

  upsertCompanyProfile(input: {
    market: StockMarket
    symbol: string
    name?: string
    companyIntro: string
    source: CompanyProfileSource
  }): CompanyProfileRecord {
    const next: CompanyProfileRecord = {
      market: input.market,
      symbol: normSymbol(input.symbol),
      name: input.name?.trim() || undefined,
      companyIntro: input.companyIntro.trim(),
      source: input.source,
      updatedAt: new Date().toISOString(),
    }
    getDb()
      .prepare(
        `INSERT INTO stocks_company_profiles (market, symbol, name, company_intro, source, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(market, symbol) DO UPDATE SET
           name = excluded.name,
           company_intro = excluded.company_intro,
           source = excluded.source,
           updated_at = excluded.updated_at`,
      )
      .run(next.market, next.symbol, next.name ?? null, next.companyIntro, next.source, next.updatedAt)
    return next
  },
}

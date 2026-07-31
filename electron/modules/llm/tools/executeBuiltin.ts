import type { BirthProfile, FortuneSettings, StockMarket } from '@shared'
import { computeDailyFortune } from '../../../../src/features/fortune/lib/FortuneService'
import { fortuneStore } from '../../fortune/FortuneStore'
import { settingsStore } from '../../settings/SettingsStore'
import { getQuoteSnapshot } from '../../stocks/PriceRangeService'
import { stocksStore } from '../../stocks/StocksStore'
import { searchKnowledge } from '../../knowledge/KnowledgeStore'
import { logger } from '../../../utils/logger'

export interface ToolExecContext {
  locale: string
}

function parseDate(raw: unknown): Date {
  if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) {
    const [y, m, d] = raw.trim().split('-').map(Number)
    return new Date(y!, m! - 1, d!)
  }
  return new Date()
}

async function getWeather(city: string): Promise<string> {
  const q = city.trim()
  if (!q) return JSON.stringify({ error: 'city required' })

  const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=zh&format=json`
  const geoRes = await fetch(geoUrl, { signal: AbortSignal.timeout(20_000) })
  if (!geoRes.ok) return JSON.stringify({ error: `geocoding HTTP ${geoRes.status}` })
  const geo = (await geoRes.json()) as {
    results?: Array<{ name: string; country?: string; latitude: number; longitude: number; admin1?: string }>
  }
  const hit = geo.results?.[0]
  if (!hit) return JSON.stringify({ error: `city not found: ${q}` })

  const wxUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${hit.latitude}&longitude=${hit.longitude}` +
    `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=3&timezone=auto`
  const wxRes = await fetch(wxUrl, { signal: AbortSignal.timeout(20_000) })
  if (!wxRes.ok) return JSON.stringify({ error: `forecast HTTP ${wxRes.status}` })
  const wx = (await wxRes.json()) as Record<string, unknown>

  return JSON.stringify({
    place: {
      name: hit.name,
      admin1: hit.admin1,
      country: hit.country,
      latitude: hit.latitude,
      longitude: hit.longitude,
    },
    current: wx.current,
    daily: wx.daily,
    note: 'Data from Open-Meteo. weather_code: see WMO codes.',
  })
}

function getDailyFortune(args: Record<string, unknown>, locale: string): string {
  const profile = fortuneStore.getProfile() as BirthProfile | null
  if (!profile) {
    return JSON.stringify({
      error: locale.startsWith('en')
        ? 'No birth profile saved. Ask the user to set it in Fortune settings.'
        : '尚未保存生辰档案，请先在「今日运势」中填写。',
    })
  }
  const settings = settingsStore.getFortuneSettings() as FortuneSettings
  const fortune = computeDailyFortune(profile, parseDate(args.date), locale, settings)
  if (!fortune) {
    return JSON.stringify({ error: 'Failed to compute fortune for profile.' })
  }
  fortuneStore.cacheDailyFortune(fortune)
  return JSON.stringify({
    date: fortune.date,
    hexagram: {
      id: fortune.hexagram.id,
      name: fortune.hexagram.nameFull,
      nameEn: fortune.hexagram.nameEn,
      tendency: fortune.hexagram.tendency,
      summary: fortune.hexagram.summary,
    },
    overall: fortune.overall,
    aspects: fortune.aspects,
    lucky: fortune.lucky,
    bazi: {
      dayMaster: fortune.bazi.dayMaster,
      element: fortune.bazi.element,
      day: fortune.bazi.day,
    },
    disclaimer: fortune.disclaimer,
  })
}

async function getStockQuote(args: Record<string, unknown>): Promise<string> {
  const market = String(args.market || '').toUpperCase()
  const symbol = String(args.symbol || '').trim().toUpperCase()
  if ((market !== 'CN' && market !== 'US') || !symbol) {
    return JSON.stringify({ error: 'market (CN|US) and symbol required' })
  }
  try {
    const quote = await getQuoteSnapshot({ market: market as StockMarket, symbol })
    return JSON.stringify({
      market,
      symbol,
      price: quote.price,
      currency: quote.currency,
      ranges: quote.ranges,
      fromCache: quote.fromCache,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return JSON.stringify({ error: msg })
  }
}

function getLatestReport(): string {
  const report = stocksStore.getLatestReport()
  if (!report) {
    return JSON.stringify({
      error: 'No local stocks report yet. User can generate one on the Stocks page.',
    })
  }
  return JSON.stringify({
    date: report.date,
    generatedAt: report.generatedAt,
    marketStatus: report.marketStatus,
    recommendations: (report.recommendations ?? []).slice(0, 12).map((r) => ({
      market: r.market,
      symbol: r.symbol,
      name: r.name,
      signal: r.signal,
      score: r.score,
      thesis: r.summary,
      reasons: r.reasons?.slice(0, 3),
      ranges: r.ranges,
    })),
  })
}

async function searchKb(args: Record<string, unknown>): Promise<string> {
  const query = String(args.query || '').trim()
  if (!query) return JSON.stringify({ error: 'query required' })
  const limit = Math.min(10, Math.max(1, Number(args.limit) || 5))
  const collectionId =
    typeof args.collectionId === 'string' && args.collectionId.trim()
      ? args.collectionId.trim()
      : undefined
  const result = await searchKnowledge(query, limit, collectionId)
  return JSON.stringify(result)
}

export async function executeBuiltinTool(
  name: string,
  argsJson: string,
  ctx: ToolExecContext,
): Promise<string> {
  let args: Record<string, unknown> = {}
  try {
    args = argsJson.trim() ? (JSON.parse(argsJson) as Record<string, unknown>) : {}
  } catch {
    return JSON.stringify({ error: 'invalid tool arguments JSON' })
  }

  try {
    switch (name) {
      case 'get_weather':
        return await getWeather(String(args.city || ''))
      case 'get_daily_fortune':
        return getDailyFortune(args, ctx.locale)
      case 'get_stock_quote':
        return await getStockQuote(args)
      case 'get_latest_stocks_report':
        return getLatestReport()
      case 'search_knowledge':
        return await searchKb(args)
      default:
        return JSON.stringify({ error: `unknown tool: ${name}` })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.warn(`tool ${name} failed: ${msg}`)
    return JSON.stringify({ error: msg })
  }
}

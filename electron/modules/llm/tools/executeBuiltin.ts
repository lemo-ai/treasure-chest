import type { BirthProfile, FortuneSettings, StockMarket, StocksReport } from '@shared'
import { computeDailyFortune } from '../../../../src/features/fortune/lib/FortuneService'
import { fortuneStore } from '../../fortune/FortuneStore'
import { settingsStore } from '../../settings/SettingsStore'
import { getQuoteSnapshot } from '../../stocks/PriceRangeService'
import { generateStocksReportFromWatchlist } from '../../stocks/StocksService'
import { stocksStore } from '../../stocks/StocksStore'
import { searchKnowledge } from '../../knowledge/KnowledgeStore'
import { fetchWebPage, searchStockSymbols, searchWeb } from './webLookup'
import { generateImage } from '../ImageGenService'
import { generateMusic, generateVideo } from '../MediaGenService'
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

function activeProvider(settings: FortuneSettings) {
  const list = settings.aiProviders ?? []
  const id = settings.aiActiveProviderId?.trim()
  return (id ? list.find((p) => p.id === id) : undefined) ?? list[0]
}

function resolveMediaModelId(
  settings: FortuneSettings,
  kind: 'image' | 'video' | 'audio',
  explicit?: string,
): string | undefined {
  const fromArgs = explicit?.trim()
  if (fromArgs) return fromArgs
  const provider = activeProvider(settings)
  if (!provider) return undefined
  if (kind === 'image') {
    return (
      provider.imageModel?.trim() ||
      provider.models.find((m) => m.outputModalities.includes('image'))?.id
    )
  }
  if (kind === 'video') {
    return (
      provider.videoModel?.trim() ||
      provider.models.find((m) => m.outputModalities.includes('video'))?.id
    )
  }
  return (
    provider.musicModel?.trim() ||
    provider.models.find((m) => m.outputModalities.includes('audio'))?.id
  )
}

async function runGenerateImage(args: Record<string, unknown>, locale: string): Promise<string> {
  const prompt = String(args.prompt || '').trim()
  if (!prompt) return JSON.stringify({ error: 'prompt required' })
  const settings = settingsStore.getFortuneSettings() as FortuneSettings
  const model = resolveMediaModelId(settings, 'image')
  if (!model) {
    return JSON.stringify({
      error: locale.startsWith('en')
        ? 'No image model configured. Add one under Settings → Models (output: image), e.g. wanx2.1-t2i-turbo.'
        : '未配置图片模型。请到「设置 → 模型」勾选输出图像的模型（如 wanx2.1-t2i-turbo）。',
    })
  }
  const result = await generateImage(prompt, settings, {
    model,
    size: typeof args.size === 'string' ? args.size : undefined,
    style: typeof args.style === 'string' ? args.style : undefined,
  })
  if (!result.ok || !result.url) {
    return JSON.stringify({ error: result.error || 'image generation failed', model })
  }
  const alt = prompt.replace(/[\[\]]/g, '').slice(0, 40) || 'image'
  const markdown = `![${alt}](${result.url})`
  return JSON.stringify({
    ok: true,
    model: result.model || model,
    url: result.url,
    markdown,
    instruction:
      'Paste the markdown field verbatim in your reply so the user can see the image. Add a short caption if helpful.',
  })
}

async function runGenerateVideo(args: Record<string, unknown>, locale: string): Promise<string> {
  const prompt = String(args.prompt || '').trim()
  if (!prompt) return JSON.stringify({ error: 'prompt required' })
  const settings = settingsStore.getFortuneSettings() as FortuneSettings
  const model = resolveMediaModelId(settings, 'video')
  if (!model) {
    return JSON.stringify({
      error: locale.startsWith('en')
        ? 'No video model configured. Add one under Settings → Models (output: video).'
        : '未配置视频模型。请到「设置 → 模型」勾选输出视频的模型。',
    })
  }
  const durationSec = Number(args.durationSec)
  const result = await generateVideo(prompt, settings, {
    model,
    durationSec: Number.isFinite(durationSec) && durationSec > 0 ? durationSec : undefined,
    aspectRatio: typeof args.aspectRatio === 'string' ? args.aspectRatio : undefined,
  })
  if (!result.ok || !(result.url || result.text)) {
    return JSON.stringify({ error: result.error || 'video generation failed', model })
  }
  const markdown =
    result.text?.trim() ||
    (result.url ? `[video](${result.url})\n\n<video controls src="${result.url}"></video>` : '')
  return JSON.stringify({
    ok: true,
    model,
    url: result.url,
    markdown,
    instruction:
      'Paste the markdown field verbatim in your reply so the user can play the video.',
  })
}

async function runGenerateMusic(args: Record<string, unknown>, locale: string): Promise<string> {
  const prompt = String(args.prompt || '').trim()
  if (!prompt) return JSON.stringify({ error: 'prompt required' })
  const settings = settingsStore.getFortuneSettings() as FortuneSettings
  const model = resolveMediaModelId(settings, 'audio')
  if (!model) {
    return JSON.stringify({
      error: locale.startsWith('en')
        ? 'No music/audio model configured. Add one under Settings → Models (output: audio), e.g. fun-music-v1.'
        : '未配置音乐模型。请到「设置 → 模型」勾选输出音频的模型（如 fun-music-v1）。',
    })
  }
  const durationSec = Number(args.durationSec)
  const result = await generateMusic(prompt, settings, {
    model,
    style: typeof args.style === 'string' ? args.style : undefined,
    instrumental: typeof args.instrumental === 'boolean' ? args.instrumental : undefined,
    durationSec: Number.isFinite(durationSec) && durationSec > 0 ? durationSec : undefined,
  })
  if (!result.ok || !(result.url || result.text)) {
    return JSON.stringify({ error: result.error || 'music generation failed', model })
  }
  const markdown =
    result.text?.trim() ||
    (result.url ? `<audio controls src="${result.url}"></audio>` : '')
  return JSON.stringify({
    ok: true,
    model,
    url: result.url,
    markdown,
    instruction:
      'Paste the markdown field verbatim in your reply so the user can play the audio.',
  })
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
    const recent = quote.bars.slice(-12).map((b) => ({
      date: b.date,
      close: b.close,
      open: b.open,
      high: b.high,
      low: b.low,
    }))
    return JSON.stringify({
      market,
      symbol,
      asOf: recent[recent.length - 1]?.date,
      price: quote.price,
      currency: quote.currency,
      rangesPct: quote.ranges,
      recentBars: recent,
      fromCache: quote.fromCache,
      disclaimer: 'Not investment advice. Past range ≠ future return.',
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return JSON.stringify({ error: msg })
  }
}

function formatReportPayload(report: StocksReport, generatedNow: boolean): string {
  return JSON.stringify({
    date: report.date,
    generatedAt: report.generatedAt,
    generatedNow,
    marketStatus: report.marketStatus,
    disclaimer: report.disclaimer,
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

/** Prefer cached report; if none, generate once (same as daily-brief workflow). */
async function getLatestReport(): Promise<string> {
  const existing = stocksStore.getLatestReport()
  if (existing) return formatReportPayload(existing, false)

  try {
    const report = await generateStocksReportFromWatchlist()
    return formatReportPayload(report, true)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.warn(`get_latest_stocks_report auto-generate failed: ${msg}`)
    return JSON.stringify({
      error: 'No local stocks report yet, and auto-generate failed.',
      detail: msg,
      hint: 'Open the Stocks page, add watchlist/scanner symbols, then click Generate.',
    })
  }
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
        return await getLatestReport()
      case 'search_knowledge':
        return await searchKb(args)
      case 'search_web':
        return await searchWeb(String(args.query || ''))
      case 'search_stock':
        return await searchStockSymbols(String(args.query || ''))
      case 'fetch_url':
        return await fetchWebPage(String(args.url || ''))
      case 'generate_image':
        return await runGenerateImage(args, ctx.locale)
      case 'generate_video':
        return await runGenerateVideo(args, ctx.locale)
      case 'generate_music':
        return await runGenerateMusic(args, ctx.locale)
      default:
        return JSON.stringify({ error: `unknown tool: ${name}` })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.warn(`tool ${name} failed: ${msg}`)
    return JSON.stringify({ error: msg })
  }
}

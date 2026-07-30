import type {
  RecommendationSignal,
  StockRecommendation,
  StocksPriceRanges,
  StocksReport,
  WatchlistItem,
} from '@shared'
import { getMarketSessionStatus } from '@shared'
import { settingsStore } from '../settings/SettingsStore'
import { stocksStore } from './StocksStore'
import { getQuoteSnapshot, zeroRanges } from './PriceRangeService'
import { z } from 'zod'

function hashSeed(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function todayDate(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function signalFor(score: number): RecommendationSignal {
  if (score >= 75) return 'buy'
  if (score >= 55) return 'watch'
  return 'avoid'
}

function zhSummary(signal: RecommendationSignal): string {
  if (signal === 'buy') return '趋势与资金面相对有利，可小仓位跟踪。'
  if (signal === 'watch') return '多空因素并存，建议观察关键位与量能。'
  return '风险偏高，优先控制仓位并等待更明确信号。'
}

function toYahooSymbol(item: WatchlistItem): string {
  if (item.market === 'US') return item.symbol
  if (item.symbol.endsWith('.SH')) return item.symbol.replace('.SH', '.SS')
  if (item.symbol.endsWith('.SZ')) return item.symbol
  return item.symbol
}

const DEFAULT_SCANNER_CANDIDATES: Record<'CN' | 'US', Array<{ symbol: string; name: string }>> = {
  CN: [
    { symbol: '600519.SH', name: '贵州茅台' },
    { symbol: '000858.SZ', name: '五粮液' },
    { symbol: '300750.SZ', name: '宁德时代' },
    { symbol: '601318.SH', name: '中国平安' },
    { symbol: '600036.SH', name: '招商银行' },
  ],
  US: [
    { symbol: 'AAPL', name: 'Apple' },
    { symbol: 'MSFT', name: 'Microsoft' },
    { symbol: 'NVDA', name: 'NVIDIA' },
    { symbol: 'AMZN', name: 'Amazon' },
    { symbol: 'META', name: 'Meta' },
  ],
}

function benchmarkSymbol(market: 'CN' | 'US'): string {
  return market === 'CN' ? '000300.SS' : '^GSPC'
}

function sentimentFromTitle(title: string): 'positive' | 'negative' | 'neutral' {
  const t = title.toLowerCase()
  const pos = ['beat', 'surge', 'upgrade', 'growth', 'record', '上涨', '利好', '增长', '新高', '突破', '增持', '盈利']
  const neg = ['miss', 'downgrade', 'lawsuit', 'drop', 'slump', '下跌', '利空', '暴跌', '亏损', '减持', '警示', '立案']
  if (pos.some((k) => t.includes(k))) return 'positive'
  if (neg.some((k) => t.includes(k))) return 'negative'
  return 'neutral'
}

function decodeXml(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

function parseRssItems(xml: string, limit = 4): Array<{ title: string; url: string }> {
  return Array.from(xml.matchAll(/<item>([\s\S]*?)<\/item>/g))
    .slice(0, limit)
    .map((m) => m[1] ?? '')
    .map((chunk) => {
      const title = decodeXml(
        chunk.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/)?.[1]
          ?? chunk.match(/<title>([\s\S]*?)<\/title>/)?.[1]
          ?? '',
      )
      const link = decodeXml(
        chunk.match(/<link>([\s\S]*?)<\/link>/)?.[1]
          ?? chunk.match(/<guid[^>]*>([\s\S]*?)<\/guid>/)?.[1]
          ?? '',
      )
      return { title, url: link }
    })
    .filter((n) => n.title && n.url)
}

function cnCodeOnly(symbol: string): string {
  return symbol.replace(/\.(SH|SZ|SS)$/i, '')
}

async function fetchRss(url: string): Promise<Array<{ title: string; url: string }>> {
  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'TreasureChest/0.1 (desktop; stocks-news)',
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
      },
    })
    if (!resp.ok) return []
    return parseRssItems(await resp.text(), 5)
  } catch {
    return []
  }
}

/** East Money article search for A-share symbols (JSONP-ish / JSON). */
async function fetchEastMoneyNews(item: WatchlistItem): Promise<Array<{ title: string; url: string }>> {
  const code = cnCodeOnly(item.symbol)
  const url =
    `https://search-api-web.eastmoney.com/search/jsonp` +
    `?cb=jQuery&param=${encodeURIComponent(
      JSON.stringify({
        uid: '',
        keyword: item.name?.trim() || code,
        type: ['cmsArticleWebOld'],
        client: 'web',
        clientType: 'web',
        clientVersion: 'curr',
        param: {
          cmsArticleWebOld: {
            searchScope: 'default',
            sort: 'default',
            pageIndex: 1,
            pageSize: 5,
          },
        },
      }),
    )}`
  try {
    const resp = await fetch(url, {
      headers: {
        Referer: 'https://so.eastmoney.com/',
        'User-Agent': 'TreasureChest/0.1',
      },
    })
    if (!resp.ok) return []
    const raw = await resp.text()
    const jsonText = raw.replace(/^jQuery\(/, '').replace(/\);?\s*$/, '')
    const data = JSON.parse(jsonText) as any
    const list = (data?.result?.cmsArticleWebOld ?? []) as Array<{ title?: string; url?: string; code?: string }>
    return list
      .map((row) => ({
        title: String(row.title ?? '').trim(),
        url: String(row.url ?? '').trim(),
      }))
      .filter((n) => n.title && n.url)
      .slice(0, 4)
  } catch {
    return []
  }
}

async function fetchGoogleNews(query: string, locale: 'zh' | 'en'): Promise<Array<{ title: string; url: string }>> {
  const q = encodeURIComponent(query)
  const url =
    locale === 'zh'
      ? `https://news.google.com/rss/search?q=${q}&hl=zh-CN&gl=CN&ceid=CN:zh-Hans`
      : `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`
  return fetchRss(url)
}

async function fetchYahooNews(item: WatchlistItem): Promise<Array<{ title: string; url: string }>> {
  const rssSymbol = encodeURIComponent(toYahooSymbol(item))
  const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${rssSymbol}&region=US&lang=en-US`
  return fetchRss(url)
}

function dedupeNews(
  items: Array<{ title: string; url: string }>,
): Array<{ title: string; url: string; sentiment: 'positive' | 'negative' | 'neutral' }> {
  const seen = new Set<string>()
  const out: Array<{ title: string; url: string; sentiment: 'positive' | 'negative' | 'neutral' }> = []
  for (const item of items) {
    const key = item.title.slice(0, 40)
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ ...item, sentiment: sentimentFromTitle(item.title) })
    if (out.length >= 4) break
  }
  return out
}

async function fetchStockNews(item: WatchlistItem): Promise<Array<{ title: string; url: string; sentiment: 'positive' | 'negative' | 'neutral' }>> {
  if (item.market === 'CN') {
    const code = cnCodeOnly(item.symbol)
    const query = [code, item.name?.trim()].filter(Boolean).join(' OR ')
    const [east, google] = await Promise.all([
      fetchEastMoneyNews(item),
      fetchGoogleNews(`${query} 股票`, 'zh'),
    ])
    return dedupeNews([...east, ...google])
  }
  const [yahoo, google] = await Promise.all([
    fetchYahooNews(item),
    fetchGoogleNews([item.symbol, item.name?.trim()].filter(Boolean).join(' OR '), 'en'),
  ])
  return dedupeNews([...yahoo, ...google])
}

function scoreFromRanges(r: StocksPriceRanges): number {
  const raw =
    60 +
    r.w1 * 1.2 +
    r.m1 * 0.8 +
    r.m3 * 0.35 +
    r.m6 * 0.15 +
    r.ytd * 0.1 -
    Math.max(0, -r.d1) * 0.8
  return Math.max(0, Math.min(100, Math.round(raw)))
}

function excessRanges(quote: StocksPriceRanges, bench: StocksPriceRanges): StocksPriceRanges {
  return {
    d1: quote.d1 - bench.d1,
    w1: quote.w1 - bench.w1,
    m1: quote.m1 - bench.m1,
    m3: quote.m3 - bench.m3,
    m6: quote.m6 - bench.m6,
    ytd: quote.ytd - bench.ytd,
    y1: quote.y1 - bench.y1,
  }
}

function buildRuleRecommendation(
  item: WatchlistItem,
  quote: { price: number; currency: string; ranges: StocksPriceRanges; sparkline?: number[]; fromCache?: boolean },
  bench: { symbol: string; ranges: StocksPriceRanges },
  source: 'watchlist' | 'scanner' | 'both',
  news: Array<{ title: string; url: string; sentiment: 'positive' | 'negative' | 'neutral' }>,
): StockRecommendation {
  const score = scoreFromRanges(quote.ranges)
  const signal = signalFor(score)
  const excess = excessRanges(quote.ranges, bench.ranges)
  const reasons = [
    `区间表现：近1日 ${quote.ranges.d1.toFixed(2)}%，近1周 ${quote.ranges.w1.toFixed(2)}%，近1月 ${quote.ranges.m1.toFixed(2)}%，近3月 ${quote.ranges.m3.toFixed(2)}%，近6月 ${quote.ranges.m6.toFixed(2)}%，今年以来 ${quote.ranges.ytd.toFixed(2)}%。`,
    `相对基准超额：近1周 ${excess.w1 >= 0 ? '+' : ''}${excess.w1.toFixed(2)}%，近1月 ${excess.m1 >= 0 ? '+' : ''}${excess.m1.toFixed(2)}%，今年以来 ${excess.ytd >= 0 ? '+' : ''}${excess.ytd.toFixed(2)}%。`,
    news[0] ? `最新资讯：${news[0].title}` : '暂无可用新闻，主要依据价格区间表现评估。',
  ]
  const risks = [
    '短期波动可能放大，需控制仓位并设置止损。',
    item.market === 'CN' ? 'A 股受政策与风格切换影响较大。' : '美股需留意财报和宏观利率预期。',
  ]
  return {
    market: item.market,
    symbol: item.symbol,
    name: item.name,
    source,
    score,
    signal,
    price: quote.price,
    currency: quote.currency,
    ranges: quote.ranges,
    sparkline: quote.sparkline,
    fromCache: quote.fromCache,
    benchmark: {
      symbol: bench.symbol,
      ranges: bench.ranges,
      excess,
    },
    news,
    summary: zhSummary(signal),
    reasons,
    risks,
  }
}

function normalizeAiSignal(value: string): RecommendationSignal {
  const v = value.toLowerCase()
  if (v.includes('buy')) return 'buy'
  if (v.includes('watch')) return 'watch'
  if (v.includes('avoid') || v.includes('sell')) return 'avoid'
  return 'watch'
}

const AiRecSchema = z.object({
  market: z.enum(['CN', 'US']),
  symbol: z.string().min(1),
  signal: z.enum(['buy', 'watch', 'avoid']).or(z.string()),
  summary: z.string().optional(),
  reasons: z.array(z.string()).optional(),
  risks: z.array(z.string()).optional(),
})
const AiReportSchema = z.object({
  recommendations: z.array(AiRecSchema),
})

async function callProviderForJson(
  prompt: string,
  provider: { apiFormat: 'openai' | 'anthropic'; baseUrl: string; apiKey: string },
  model: string,
): Promise<string | null> {
  const endpointBase = provider.baseUrl.replace(/\/$/, '')
  if (provider.apiFormat === 'anthropic') {
    const resp = await fetch(`${endpointBase}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': provider.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1200,
        temperature: 0.1,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!resp.ok) return null
    const data = (await resp.json()) as any
    const text = (data?.content ?? []).map((c: any) => c?.text ?? '').join('\n').trim()
    return text || null
  }
  const resp = await fetch(`${endpointBase}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!resp.ok) return null
  const data = (await resp.json()) as any
  const text = data?.choices?.[0]?.message?.content
  return typeof text === 'string' && text.trim() ? text.trim() : null
}

async function aiEnhanceRecommendations(base: StockRecommendation[]): Promise<StockRecommendation[]> {
  const f = settingsStore.getFortuneSettings()
  if (!f.aiApiKey.trim()) return base
  const provider = f.aiProviders.find((p) => p.id === f.aiActiveProviderId)
  if (!provider) return base
  const model = f.aiModel || provider.models[0] || 'gpt-4o-mini'

  const payload = {
    date: todayDate(),
    recommendations: base.map((r) => ({
      market: r.market,
      symbol: r.symbol,
      score: r.score,
      price: r.price,
      currency: r.currency,
      ranges: r.ranges,
      news: r.news.slice(0, 3).map((n) => ({ title: n.title, sentiment: n.sentiment })),
    })),
  }
  const schemaPrompt = [
    '你是股票信息整理助手。基于给定真实数据，输出 JSON（不要 Markdown 代码块）。',
    '要求：不构成投资建议，不能虚构数字。',
    'JSON 结构：{"recommendations":[{"market":"CN|US","symbol":"...","signal":"buy|watch|avoid","summary":"...","reasons":["..."],"risks":["..."]}]}',
    '每只股票给 1 句 summary，2 条 reasons，2 条 risks。',
    `输入数据：${JSON.stringify(payload)}`,
  ].join('\n')
  const retryPrompt = `${schemaPrompt}\n仅输出严格 JSON，不要任何多余文本。`

  try {
    let text = await callProviderForJson(schemaPrompt, provider, model)
    if (!text) text = await callProviderForJson(retryPrompt, provider, model)
    if (!text) return base

    let parsedUnknown: unknown
    try {
      parsedUnknown = JSON.parse(text)
    } catch {
      const retried = await callProviderForJson(retryPrompt, provider, model)
      if (!retried) return base
      parsedUnknown = JSON.parse(retried)
    }
    const parsed = AiReportSchema.safeParse(parsedUnknown)
    if (!parsed.success) return base
    return base.map((item) => {
      const hit = parsed.data.recommendations.find((x) => x.symbol === item.symbol && x.market === item.market)
      if (!hit) return item
      return {
        ...item,
        signal: normalizeAiSignal(String(hit.signal ?? item.signal)),
        summary: typeof hit.summary === 'string' && hit.summary.trim() ? hit.summary.trim() : item.summary,
        reasons: Array.isArray(hit.reasons) ? hit.reasons.slice(0, 3).map(String) : item.reasons,
        risks: Array.isArray(hit.risks) ? hit.risks.slice(0, 3).map(String) : item.risks,
      }
    })
  } catch {
    return base
  }
}

export async function generateStocksReportFromWatchlist(): Promise<StocksReport> {
  const stocksCfg = settingsStore.getStocksSettings()
  const today = todayDate()
  const cnStatus = getMarketSessionStatus('CN', today)
  const usStatus = getMarketSessionStatus('US', today)

  const enabledMarkets = new Set<'CN' | 'US'>()
  if (stocksCfg.marketCN) enabledMarkets.add('CN')
  if (stocksCfg.marketUS) enabledMarkets.add('US')
  if (enabledMarkets.size === 0) {
    enabledMarkets.add('CN')
    enabledMarkets.add('US')
  }

  // Closed markets still appear in marketStatus, but are skipped in analysis.
  const openMarkets = new Set<'CN' | 'US'>(
    (['CN', 'US'] as const).filter((m) => enabledMarkets.has(m) && (m === 'CN' ? cnStatus.open : usStatus.open)),
  )

  const watchlist = stocksStore
    .getWatchlist()
    .filter((item) => item.enabled && openMarkets.has(item.market))
  const scannerFromDb = stocksStore
    .getScannerPool()
    .filter((item) => item.enabled && openMarkets.has(item.market))
  const scanner: WatchlistItem[] = (
    scannerFromDb.length > 0
      ? scannerFromDb
      : (['CN', 'US'] as const)
          .filter((market) => openMarkets.has(market))
          .flatMap((market) =>
            DEFAULT_SCANNER_CANDIDATES[market].map((x) => ({
              market,
              symbol: x.symbol,
              name: x.name,
              enabled: true,
              updatedAt: new Date().toISOString(),
            })),
          )
  )
    .slice(0, stocksCfg.scannerMax)
    .map((x) => ({ ...x }))

  const mergedMap = new Map<string, WatchlistItem & { source: 'watchlist' | 'scanner' | 'both' }>()
  for (const item of scanner) {
    mergedMap.set(`${item.market}|${item.symbol}`, { ...item, source: 'scanner' })
  }
  for (const item of watchlist) {
    const key = `${item.market}|${item.symbol}`
    const hit = mergedMap.get(key)
    mergedMap.set(key, { ...item, source: hit ? 'both' : 'watchlist' })
  }
  const pool = Array.from(mergedMap.values())

  const rawRecs: StockRecommendation[] = []
  const benchCache = new Map<'CN' | 'US', { symbol: string; ranges: StocksPriceRanges }>()
  let quoteFallbackCount = 0
  let newsHitCount = 0
  let cacheHitCount = 0

  for (const item of pool) {
    try {
      let bench = benchCache.get(item.market)
      if (!bench) {
        const benchQuote = await getQuoteSnapshot({
          market: item.market,
          symbol: benchmarkSymbol(item.market),
          enabled: true,
          updatedAt: new Date().toISOString(),
        })
        bench = { symbol: benchmarkSymbol(item.market), ranges: benchQuote.ranges }
        benchCache.set(item.market, bench)
      }
      const [quote, news] = await Promise.all([getQuoteSnapshot(item), fetchStockNews(item)])
      if (news.length > 0) newsHitCount += 1
      if (quote.fromCache) cacheHitCount += 1
      rawRecs.push(
        buildRuleRecommendation(
          item,
          {
            price: quote.price,
            currency: quote.currency,
            ranges: quote.ranges,
            sparkline: quote.sparkline,
            fromCache: quote.fromCache,
          },
          bench,
          item.source,
          news,
        ),
      )
    } catch {
      quoteFallbackCount += 1
      const seed = hashSeed(`${today}|${item.market}|${item.symbol}`)
      const fallbackRanges: StocksPriceRanges = {
        d1: ((seed % 400) - 200) / 100,
        w1: ((seed % 1200) - 600) / 100,
        m1: (((seed >> 3) % 2200) - 1000) / 100,
        m3: (((seed >> 5) % 3000) - 1300) / 100,
        m6: (((seed >> 7) % 4000) - 1800) / 100,
        ytd: (((seed >> 9) % 3500) - 1500) / 100,
        y1: (((seed >> 11) % 5000) - 2000) / 100,
      }
      const benchFallback = {
        symbol: benchmarkSymbol(item.market),
        ranges: zeroRanges(),
      }
      rawRecs.push(
        buildRuleRecommendation(
          item,
          {
            price: 0,
            currency: item.market === 'US' ? 'USD' : 'CNY',
            ranges: fallbackRanges,
            sparkline: undefined,
            fromCache: false,
          },
          benchFallback,
          item.source,
          [],
        ),
      )
    }
  }

  const aiEnabled = settingsStore.getFortuneSettings().aiPolish && Boolean(settingsStore.getFortuneSettings().aiApiKey)
  const recs = aiEnabled && rawRecs.length > 0 ? await aiEnhanceRecommendations(rawRecs) : rawRecs
  const aiState: 'disabled' | 'success' | 'fallback' =
    !aiEnabled || rawRecs.length === 0
      ? 'disabled'
      : (JSON.stringify(recs) === JSON.stringify(rawRecs) ? 'fallback' : 'success')
  const capped = recs.sort((a, b) => b.score - a.score).slice(0, stocksCfg.maxRecommendations)

  const closedNotes = (['CN', 'US'] as const)
    .filter((m) => enabledMarkets.has(m) && !(m === 'CN' ? cnStatus.open : usStatus.open))
    .map((m) => {
      const st = m === 'CN' ? cnStatus : usStatus
      return `${m}：${st.reason ?? '休市'}`
    })

  const report: StocksReport = {
    date: today,
    generatedAt: new Date().toISOString(),
    recommendations: capped,
    disclaimer: [
      '仅供学习与信息参考，不构成投资建议；市场有风险，决策自负。',
      closedNotes.length > 0 ? `休市说明：${closedNotes.join('；')}` : '',
    ]
      .filter(Boolean)
      .join(' '),
    marketStatus: {
      CN: { open: cnStatus.open, reason: cnStatus.reason },
      US: { open: usStatus.open, reason: usStatus.reason },
    },
    source: {
      engine: 'stocks-v3/cache+range+news',
      aiEnhanced: aiEnabled && rawRecs.length > 0,
      status: {
        total: rawRecs.length,
        quoteFallbackCount,
        newsHitCount,
        cacheHitCount,
        ai: aiState,
      },
    },
  }
  stocksStore.saveReport(report)
  return report
}

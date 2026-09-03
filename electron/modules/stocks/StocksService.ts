import type {
  RecommendationSignal,
  StockRecommendation,
  StocksPriceRanges,
  StocksReport,
  WatchlistItem,
} from '@shared'
import { getMarketSessionStatus, firstModelId } from '@shared'
import { settingsStore } from '../settings/SettingsStore'
import { stocksStore, type CompanyProfileSource } from './StocksStore'
import { getQuoteSnapshot, zeroRanges } from './PriceRangeService'
import { z } from 'zod'
import { logger } from '../../utils/logger'

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

type NewsSourceId =
  | 'eastmoney'
  | 'sina'
  | 'wallstreetcn'
  | 'google'
  | 'yahoo'
  | 'nasdaq'
  | 'seekingalpha'
  | 'announcement'

type RawNewsHit = { title: string; url: string; source: NewsSourceId }
type StockNewsItem = {
  title: string
  url: string
  sentiment: 'positive' | 'negative' | 'neutral'
  source: NewsSourceId
}

const NEWS_SOURCE_LABEL: Record<NewsSourceId, string> = {
  eastmoney: '东方财富',
  sina: '新浪财经',
  wallstreetcn: '华尔街见闻',
  google: 'Google 资讯',
  yahoo: 'Yahoo Finance',
  nasdaq: 'Nasdaq',
  seekingalpha: 'Seeking Alpha',
  announcement: '公司公告',
}

const NEWS_FETCH_TIMEOUT_MS = 7_000
const NEWS_LIMIT = 8
const NEWS_PER_SOURCE_CAP = 3

function sentimentFromTitle(title: string): 'positive' | 'negative' | 'neutral' {
  const t = title.toLowerCase()
  const pos = [
    'beat', 'surge', 'upgrade', 'growth', 'record', 'rally', 'bullish',
    '上涨', '利好', '增长', '新高', '突破', '增持', '盈利', '提价', '回购', '超预期', '净流入',
  ]
  const neg = [
    'miss', 'downgrade', 'lawsuit', 'drop', 'slump', 'bearish', 'probe', 'fine',
    '下跌', '利空', '暴跌', '亏损', '减持', '警示', '立案', '处罚', '下滑', '净流出',
  ]
  if (pos.some((k) => t.includes(k))) return 'positive'
  if (neg.some((k) => t.includes(k))) return 'negative'
  return 'neutral'
}

function decodeXml(text: string): string {
  return stripHtml(
    text
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' '),
  )
}

/** Remove search-highlight tags like <em>茅台</em> from news titles. */
function stripHtml(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
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

function cnExchangePrefix(symbol: string): 'SH' | 'SZ' {
  return /\.SZ$/i.test(symbol) ? 'SZ' : 'SH'
}

async function fetchText(
  url: string,
  init?: RequestInit,
  timeoutMs = NEWS_FETCH_TIMEOUT_MS,
): Promise<string | null> {
  try {
    const resp = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!resp.ok) return null
    return await resp.text()
  } catch {
    return null
  }
}

async function fetchBuffer(
  url: string,
  init?: RequestInit,
  timeoutMs = NEWS_FETCH_TIMEOUT_MS,
): Promise<Buffer | null> {
  try {
    const resp = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!resp.ok) return null
    return Buffer.from(await resp.arrayBuffer())
  } catch {
    return null
  }
}

function decodePossiblyGbk(buf: Buffer): string {
  const asUtf8 = buf.toString('utf8')
  const head = asUtf8.slice(0, 800).toLowerCase()
  if (head.includes('charset=gbk') || head.includes('charset=gb2312')) {
    try {
      return new TextDecoder('gbk').decode(buf)
    } catch {
      return asUtf8
    }
  }
  return asUtf8
}

async function fetchRss(url: string): Promise<Array<{ title: string; url: string }>> {
  const text = await fetchText(url, {
    headers: {
      'User-Agent': 'TreasureChest/0.1 (desktop; stocks-news)',
      Accept: 'application/rss+xml, application/xml, text/xml, */*',
    },
  })
  if (!text) return []
  return parseRssItems(text, 6)
}

function newsRelevance(title: string, item: WatchlistItem): number {
  const code = cnCodeOnly(item.symbol)
  const name = (item.name ?? '').trim()
  const lower = title.toLowerCase()
  let score = 0
  if (code && title.includes(code)) score += 3
  if (item.market === 'US' && lower.includes(item.symbol.toLowerCase())) score += 3
  if (name && title.includes(name)) score += 3
  if (name.length >= 2 && title.includes(name.slice(0, 2))) score += 1
  return score
}

/** East Money article search for A-share symbols (JSONP-ish / JSON). */
async function fetchEastMoneyNews(item: WatchlistItem): Promise<RawNewsHit[]> {
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
            pageSize: 6,
          },
        },
      }),
    )}`
  const raw = await fetchText(url, {
    headers: {
      Referer: 'https://so.eastmoney.com/',
      'User-Agent': 'TreasureChest/0.1',
    },
  })
  if (!raw) return []
  try {
    const jsonText = raw.replace(/^jQuery\(/, '').replace(/\);?\s*$/, '')
    const data = JSON.parse(jsonText) as any
    const list = (data?.result?.cmsArticleWebOld ?? []) as Array<{ title?: string; url?: string }>
    return list
      .map((row) => ({
        title: stripHtml(decodeXml(String(row.title ?? ''))),
        url: String(row.url ?? '').trim(),
        source: 'eastmoney' as const,
      }))
      .filter((n) => n.title && n.url)
      .slice(0, 5)
  } catch {
    return []
  }
}

/** East Money F10 news bulletin (stock page). */
async function fetchEastMoneyF10News(item: WatchlistItem): Promise<RawNewsHit[]> {
  if (item.market !== 'CN') return []
  const code = `${cnExchangePrefix(item.symbol)}${cnCodeOnly(item.symbol)}`
  const raw = await fetchText(
    `https://emweb.securities.eastmoney.com/PC_HSF10/NewsBulletin/PageAjax?code=${code}`,
    {
      headers: {
        Referer: 'https://emweb.securities.eastmoney.com/',
        'User-Agent': 'TreasureChest/0.1',
      },
    },
  )
  if (!raw) return []
  try {
    const data = JSON.parse(raw) as any
    const items = (data?.gszx?.data?.items ?? []) as Array<{ title?: string; url?: string; uniqueUrl?: string }>
    return items
      .map((row) => ({
        title: stripHtml(String(row.title ?? '')),
        url: String(row.url ?? row.uniqueUrl ?? '').trim(),
        source: 'eastmoney' as const,
      }))
      .filter((n) => n.title && n.url)
      .filter((n) => newsRelevance(n.title, item) > 0)
      .slice(0, 4)
  } catch {
    return []
  }
}

/** Company announcements via East Money notice API. */
async function fetchEastMoneyAnnouncements(item: WatchlistItem): Promise<RawNewsHit[]> {
  if (item.market !== 'CN') return []
  const code = cnCodeOnly(item.symbol)
  const raw = await fetchText(
    `https://np-anotice-stock.eastmoney.com/api/security/ann?sr=-1&page_size=4&page_index=1&ann_type=A&client_source=web&stock_list=${code}`,
    {
      headers: {
        Referer: 'https://data.eastmoney.com/',
        'User-Agent': 'TreasureChest/0.1',
      },
    },
  )
  if (!raw) return []
  try {
    const data = JSON.parse(raw) as any
    const list = (data?.data?.list ?? []) as Array<{ title_ch?: string; title?: string; art_code?: string }>
    return list
      .map((row): RawNewsHit | null => {
        const title = stripHtml(String(row.title_ch ?? row.title ?? ''))
        const art = String(row.art_code ?? '').trim()
        if (!title || !art) return null
        return {
          title,
          url: `https://data.eastmoney.com/notices/detail/${code}/${art}.html`,
          source: 'announcement',
        }
      })
      .filter((n): n is RawNewsHit => n !== null)
      .slice(0, 3)
  } catch {
    return []
  }
}

/** Sina Finance per-stock news page (GBK HTML). */
async function fetchSinaStockNews(item: WatchlistItem): Promise<RawNewsHit[]> {
  if (item.market !== 'CN') return []
  const code = cnCodeOnly(item.symbol)
  const prefix = cnExchangePrefix(item.symbol).toLowerCase()
  const buf = await fetchBuffer(
    `https://vip.stock.finance.sina.com.cn/corp/go.php/vCB_AllNewsStock/symbol/${prefix}${code}.phtml`,
    { headers: { 'User-Agent': 'TreasureChest/0.1' } },
  )
  if (!buf) return []
  const html = decodePossiblyGbk(buf)
  const matches = html.matchAll(
    /(\d{4}-\d{2}-\d{2})&nbsp;\d{2}:\d{2}&nbsp;&nbsp;<a target='_blank' href='([^']+)'>([^<]+)<\/a>/g,
  )
  const out: RawNewsHit[] = []
  for (const m of matches) {
    const title = stripHtml(m[3] ?? '')
    const url = String(m[2] ?? '').trim()
    if (!title || !url) continue
    out.push({ title, url, source: 'sina' })
    if (out.length >= 6) break
  }
  return out
}

/** Wall Street CN article search (CN + US coverage in Chinese). */
async function fetchWallstreetcnNews(item: WatchlistItem): Promise<RawNewsHit[]> {
  const queries =
    item.market === 'CN'
      ? [item.name?.trim() || cnCodeOnly(item.symbol)]
      : [item.name?.trim() || item.symbol, item.symbol].filter(Boolean)
  const out: RawNewsHit[] = []
  const seen = new Set<string>()
  for (const q of queries) {
    if (!q) continue
    const raw = await fetchText(
      `https://api-one-wscn.awtmt.com/apiv1/search/article?limit=5&query=${encodeURIComponent(q)}`,
      { headers: { 'User-Agent': 'TreasureChest/0.1', Accept: 'application/json' } },
    )
    if (!raw) continue
    try {
      const data = JSON.parse(raw) as any
      const items = (data?.data?.items ?? []) as Array<{
        title?: string
        uri?: string
        url?: string
        resource?: { title?: string; uri?: string }
      }>
      for (const row of items) {
        const title = stripHtml(String(row.title ?? row.resource?.title ?? ''))
        const url = String(row.uri ?? row.resource?.uri ?? row.url ?? '').trim()
        if (!title || !url || seen.has(title.slice(0, 40))) continue
        seen.add(title.slice(0, 40))
        out.push({ title, url, source: 'wallstreetcn' })
        if (out.length >= 5) return out
      }
    } catch {
      /* ignore */
    }
  }
  return out
}

async function fetchGoogleNews(query: string, locale: 'zh' | 'en'): Promise<RawNewsHit[]> {
  const q = encodeURIComponent(query)
  const url =
    locale === 'zh'
      ? `https://news.google.com/rss/search?q=${q}&hl=zh-CN&gl=CN&ceid=CN:zh-Hans`
      : `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`
  const items = await fetchRss(url)
  return items.map((n) => ({ ...n, source: 'google' as const }))
}

async function fetchYahooNews(item: WatchlistItem): Promise<RawNewsHit[]> {
  const rssSymbol = encodeURIComponent(toYahooSymbol(item))
  const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${rssSymbol}&region=US&lang=en-US`
  const items = await fetchRss(url)
  return items.map((n) => ({ ...n, source: 'yahoo' as const }))
}

async function fetchNasdaqNews(item: WatchlistItem): Promise<RawNewsHit[]> {
  if (item.market !== 'US') return []
  const items = await fetchRss(`https://www.nasdaq.com/feed/rssoutbound?symbol=${encodeURIComponent(item.symbol)}`)
  return items.map((n) => ({ ...n, source: 'nasdaq' as const }))
}

async function fetchSeekingAlphaNews(item: WatchlistItem): Promise<RawNewsHit[]> {
  if (item.market !== 'US') return []
  const items = await fetchRss(`https://seekingalpha.com/api/sa/combined/${encodeURIComponent(item.symbol)}.xml`)
  return items.map((n) => ({ ...n, source: 'seekingalpha' as const }))
}

function mergeMultiSourceNews(batches: RawNewsHit[], item: WatchlistItem, limit = NEWS_LIMIT): StockNewsItem[] {
  const ranked = batches
    .map((n) => ({
      ...n,
      title: stripHtml(n.title),
      relevance: newsRelevance(n.title, item),
    }))
    .filter((n) => n.title && n.url)
    .sort((a, b) => b.relevance - a.relevance || a.source.localeCompare(b.source))

  const seen = new Set<string>()
  const perSource = new Map<NewsSourceId, number>()
  const primary: StockNewsItem[] = []
  const overflow: StockNewsItem[] = []

  for (const hit of ranked) {
    const key = hit.title.slice(0, 40)
    if (seen.has(key)) continue
    seen.add(key)
    const entry: StockNewsItem = {
      title: hit.title,
      url: hit.url,
      source: hit.source,
      sentiment: sentimentFromTitle(hit.title),
    }
    const used = perSource.get(hit.source) ?? 0
    if (used < NEWS_PER_SOURCE_CAP) {
      perSource.set(hit.source, used + 1)
      primary.push(entry)
    } else {
      overflow.push(entry)
    }
  }

  // Prefer source diversity: interleave one from each source before filling.
  const bySource = new Map<NewsSourceId, StockNewsItem[]>()
  for (const n of primary) {
    const list = bySource.get(n.source) ?? []
    list.push(n)
    bySource.set(n.source, list)
  }
  const diversified: StockNewsItem[] = []
  let round = 0
  while (diversified.length < limit) {
    let added = false
    for (const list of bySource.values()) {
      if (round < list.length) {
        diversified.push(list[round]!)
        added = true
        if (diversified.length >= limit) break
      }
    }
    if (!added) break
    round += 1
  }
  for (const n of overflow) {
    if (diversified.length >= limit) break
    diversified.push(n)
  }
  return diversified
}

function summarizeNewsSentiment(news: StockNewsItem[]): {
  positive: number
  negative: number
  neutral: number
  sources: NewsSourceId[]
  tone: '偏利好' | '偏利空' | '中性分化' | '样本不足'
} {
  const positive = news.filter((n) => n.sentiment === 'positive').length
  const negative = news.filter((n) => n.sentiment === 'negative').length
  const neutral = news.filter((n) => n.sentiment === 'neutral').length
  const sources = [...new Set(news.map((n) => n.source))]
  if (news.length === 0) {
    return { positive, negative, neutral, sources, tone: '样本不足' }
  }
  const tone =
    positive > negative + 1 ? '偏利好' : negative > positive + 1 ? '偏利空' : '中性分化'
  return { positive, negative, neutral, sources, tone }
}

function newsScoreAdjust(news: StockNewsItem[]): number {
  const { positive, negative, sources } = summarizeNewsSentiment(news)
  const polarity = (positive - negative) * 2
  const diversity = Math.min(3, Math.max(0, sources.length - 1))
  return Math.max(-10, Math.min(10, polarity + diversity))
}

async function fetchStockNews(item: WatchlistItem): Promise<StockNewsItem[]> {
  if (item.market === 'CN') {
    const code = cnCodeOnly(item.symbol)
    const query = [code, item.name?.trim()].filter(Boolean).join(' OR ')
    const batches = await Promise.all([
      fetchEastMoneyNews(item),
      fetchEastMoneyF10News(item),
      fetchEastMoneyAnnouncements(item),
      fetchSinaStockNews(item),
      fetchWallstreetcnNews(item),
      fetchGoogleNews(`${query} 股票`, 'zh'),
    ])
    return mergeMultiSourceNews(batches.flat(), item)
  }

  const query = [item.symbol, item.name?.trim()].filter(Boolean).join(' OR ')
  const batches = await Promise.all([
    fetchYahooNews(item),
    fetchNasdaqNews(item),
    fetchSeekingAlphaNews(item),
    fetchWallstreetcnNews(item),
    fetchGoogleNews(query, 'en'),
  ])
  return mergeMultiSourceNews(batches.flat(), item)
}

/** Yahoo asset profile / summary for a short company description. */
async function fetchYahooCompanyIntro(item: WatchlistItem): Promise<string | null> {
  const yahooSymbol = encodeURIComponent(toYahooSymbol(item))
  const url =
    `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${yahooSymbol}` +
    `?modules=assetProfile,summaryProfile,price`
  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 TreasureChest/0.1',
        Accept: 'application/json',
      },
    })
    if (!resp.ok) return null
    const data = (await resp.json()) as any
    const result = data?.quoteSummary?.result?.[0]
    const summary =
      result?.assetProfile?.longBusinessSummary ??
      result?.summaryProfile?.longBusinessSummary ??
      result?.assetProfile?.description ??
      null
    if (typeof summary !== 'string' || !summary.trim()) return null
    return summary.replace(/\s+/g, ' ').trim()
  } catch {
    return null
  }
}

/** East Money F10 survey — reliable for A-share company intros. */
async function fetchEastMoneyCompanyIntro(item: WatchlistItem): Promise<string | null> {
  if (item.market !== 'CN') return null
  const code = cnCodeOnly(item.symbol)
  const prefix = /\.SZ$/i.test(item.symbol) ? 'SZ' : 'SH'
  const url =
    `https://emweb.securities.eastmoney.com/PC_HSF10/CompanySurvey/CompanySurveyAjax?code=${prefix}${code}`
  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 TreasureChest/0.1',
        Referer: 'https://emweb.securities.eastmoney.com/',
        Accept: 'application/json, text/plain, */*',
      },
    })
    if (!resp.ok) return null
    const data = (await resp.json()) as any
    const jb = data?.jbzl ?? {}
    const name = String(jb.gsmc ?? jb.agjc ?? item.name ?? '').trim()
    const industry = String(jb.sshy ?? jb.sszjhhy ?? '').trim()
    const scope = String(jb.jyfw ?? '').replace(/\s+/g, ' ').trim()
    const brief = String(jb.gsjj ?? '').replace(/\s+/g, ' ').trim()
    const parts = [
      name ? `${name}${item.symbol ? `（${item.symbol}）` : ''}` : '',
      industry ? `所属行业：${industry}。` : '',
      brief || '',
      scope ? `经营范围：${scope}` : '',
    ].filter(Boolean)
    if (parts.length === 0) return null
    return parts.join(' ')
  } catch {
    return null
  }
}

async function fetchRawCompanyIntro(item: WatchlistItem): Promise<string | null> {
  if (item.market === 'CN') {
    const em = await fetchEastMoneyCompanyIntro(item)
    if (em) return em
  }
  return fetchYahooCompanyIntro(item)
}

function fallbackCompanyIntro(item: WatchlistItem): string {
  const label = item.name?.trim() || item.symbol
  const marketLabel = item.market === 'CN' ? 'A 股上市公司' : '美股上市公司'
  return `${label}（${item.symbol}）为${marketLabel}。暂未获取到公开业务简介，建议结合公司公告、财报与下方资讯自行核实主营业务。`
}

function isWeakIntro(text: string): boolean {
  const t = text.trim()
  if (t.length < 80) return true
  if (t.includes('暂未获取到公开业务简介')) return true
  if (t.includes('为A 股上市公司。') && t.length < 100) return true
  if (t.includes('为美股上市公司。') && t.length < 100) return true
  return false
}

function isUsableCachedIntro(source: CompanyProfileSource, intro: string, aiReady: boolean): boolean {
  if (!intro.trim() || isWeakIntro(intro)) return false
  if (source === 'ai') return true
  // East Money / Yahoo briefs that are already detailed can be used as-is.
  if (intro.trim().length >= 120 && !aiReady) return true
  // With AI available, refresh non-AI cache once into a durable Chinese summary.
  return !aiReady
}

const AiCompanyBatchSchema = z.object({
  profiles: z.array(
    z.object({
      market: z.enum(['CN', 'US']),
      symbol: z.string().min(1),
      companyIntro: z.string().min(40),
    }),
  ),
})

function activeAiProvider(): {
  provider: { apiFormat: 'openai' | 'anthropic'; baseUrl: string; apiKey: string }
  model: string
} | null {
  const f = settingsStore.getFortuneSettings()
  const key = (f.aiApiKey || '').trim()
  if (!key) return null
  const provider = f.aiProviders.find((p) => p.id === f.aiActiveProviderId)
  if (!provider || !provider.apiKey.trim()) {
    // Top-level key may still work with provider endpoint settings.
    return {
      provider: {
        apiFormat: f.aiApiFormat,
        baseUrl: f.aiBaseUrl,
        apiKey: key,
      },
      model: f.aiModel || f.aiModels[0] || 'gpt-4o-mini',
    }
  }
  return {
    provider: {
      apiFormat: provider.apiFormat,
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey.trim() || key,
    },
      model: f.aiModel || firstModelId(provider.models) || 'gpt-4o-mini',
  }
}

async function aiSummarizeCompanyProfiles(
  items: Array<{ item: WatchlistItem; rawIntro: string | null }>,
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (items.length === 0) return out
  const active = activeAiProvider()
  if (!active) return out
  const { provider, model } = active

  const chunkSize = 5
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize)
    const payload = chunk.map(({ item, rawIntro }) => ({
      market: item.market,
      symbol: item.symbol,
      name: item.name,
      rawIntro: rawIntro ?? '',
    }))
    const prompt = [
      '你是证券研究助理。请为下列每只股票撰写详细「公司简介」（中文）。',
      '要求：',
      '1) 尽量写全、写清楚，不限制字数；覆盖业务、行业、主要产品/服务、商业模式或客户群等；',
      '2) 若有 rawIntro，必须基于它完整改写扩写，不要丢掉关键事实；若为空，用公开常识概述并避免虚假精确财务数字；',
      '3) 不要买卖建议、不要预测股价；',
      '4) 只输出 JSON：{"profiles":[{"market":"CN|US","symbol":"...","companyIntro":"..."}]}',
      `输入：${JSON.stringify(payload)}`,
    ].join('\n')
    try {
      let text = await callProviderForJson(prompt, provider, model)
      if (!text) {
        text = await callProviderForJson(`${prompt}\n仅输出严格 JSON，companyIntro 必须足够详细。`, provider, model)
      }
      if (!text) {
        // Fallback: one-by-one for this chunk
        for (const row of chunk) {
          const single = await aiSummarizeOneCompany(row.item, row.rawIntro, provider, model)
          if (single) out.set(`${row.item.market}|${row.item.symbol.toUpperCase()}`, single)
        }
        continue
      }
      let parsedUnknown: unknown
      try {
        parsedUnknown = JSON.parse(text)
      } catch {
        continue
      }
      const parsed = AiCompanyBatchSchema.safeParse(parsedUnknown)
      if (!parsed.success) {
        for (const row of chunk) {
          const single = await aiSummarizeOneCompany(row.item, row.rawIntro, provider, model)
          if (single) out.set(`${row.item.market}|${row.item.symbol.toUpperCase()}`, single)
        }
        continue
      }
      for (const row of parsed.data.profiles) {
        const intro = row.companyIntro.trim()
        if (isWeakIntro(intro)) continue
        out.set(`${row.market}|${row.symbol.toUpperCase()}`, intro)
      }
      // Fill misses one-by-one
      for (const row of chunk) {
        const key = `${row.item.market}|${row.item.symbol.toUpperCase()}`
        if (out.has(key)) continue
        const single = await aiSummarizeOneCompany(row.item, row.rawIntro, provider, model)
        if (single) out.set(key, single)
      }
    } catch (err) {
      logger.warn('ai company profile batch failed', err)
    }
  }
  return out
}

async function aiSummarizeOneCompany(
  item: WatchlistItem,
  rawIntro: string | null,
  provider: { apiFormat: 'openai' | 'anthropic'; baseUrl: string; apiKey: string },
  model: string,
): Promise<string | null> {
  const prompt = [
    '为下面这只股票写一段详细中文「公司简介」。',
    '尽量写全、写清楚，不限制字数；说明业务、行业、主要产品/服务；不要投资建议。',
    '只输出 JSON：{"companyIntro":"..."}',
    `股票：${JSON.stringify({ market: item.market, symbol: item.symbol, name: item.name, rawIntro: rawIntro ?? '' })}`,
  ].join('\n')
  try {
    const text = await callProviderForJson(prompt, provider, model)
    if (!text) return null
    const parsed = JSON.parse(text) as { companyIntro?: string }
    const intro = typeof parsed.companyIntro === 'string' ? parsed.companyIntro.trim() : ''
    return intro && !isWeakIntro(intro) ? intro : null
  } catch {
    return null
  }
}

/**
 * Company intros are relatively stable → SQLite cache first.
 * Raw sources: East Money (CN) / Yahoo (US). AI expands into durable Chinese summaries when Key 可用.
 */
async function resolveCompanyIntroMap(pool: WatchlistItem[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const aiReady = Boolean(activeAiProvider())

  const needBuild: WatchlistItem[] = []
  for (const item of pool) {
    const key = `${item.market}|${item.symbol}`
    const cached = stocksStore.getCompanyProfile(item.market, item.symbol)
    if (cached && isUsableCachedIntro(cached.source, cached.companyIntro, aiReady)) {
      map.set(key, cached.companyIntro)
      continue
    }
    needBuild.push(item)
  }

  if (needBuild.length === 0) {
    logger.info(`company profiles: all ${pool.length} from SQLite cache`)
    return map
  }

  const rawPairs = await Promise.all(
    needBuild.map(async (item) => ({
      item,
      rawIntro: await fetchRawCompanyIntro(item),
    })),
  )

  const aiMap = aiReady ? await aiSummarizeCompanyProfiles(rawPairs) : new Map<string, string>()

  for (const { item, rawIntro } of rawPairs) {
    const key = `${item.market}|${item.symbol}`
    const aiIntro = aiMap.get(`${item.market}|${item.symbol.toUpperCase()}`) ?? aiMap.get(key)
    let companyIntro = ''
    let source: CompanyProfileSource = 'fallback'

    if (aiIntro && !isWeakIntro(aiIntro)) {
      companyIntro = aiIntro
      source = 'ai'
    } else if (rawIntro && !isWeakIntro(rawIntro)) {
      companyIntro = rawIntro
      source = 'yahoo'
    } else if (rawIntro) {
      companyIntro = rawIntro
      source = 'yahoo'
    } else {
      companyIntro = fallbackCompanyIntro(item)
      source = 'fallback'
    }

    stocksStore.upsertCompanyProfile({
      market: item.market,
      symbol: item.symbol,
      name: item.name,
      companyIntro,
      source,
    })
    map.set(key, companyIntro)
  }

  logger.info(
    `company profiles resolved: cache-hit=${pool.length - needBuild.length} built=${needBuild.length} ai=${aiReady}`,
  )
  return map
}

function zhOutlook(
  signal: RecommendationSignal,
  ranges: StocksPriceRanges,
  excess: StocksPriceRanges,
  news: StockNewsItem[],
): string {
  const tone =
    signal === 'buy' ? '偏积极' : signal === 'watch' ? '中性观望' : '偏谨慎'
  const newsSummary = summarizeNewsSentiment(news)
  const sourceNames = newsSummary.sources.map((s) => NEWS_SOURCE_LABEL[s]).join('、')
  const newsLine =
    news.length === 0
      ? '资讯样本不足，研判主要依据行情区间。'
      : `综合 ${newsSummary.sources.length} 个来源（${sourceNames}）共 ${news.length} 条资讯，情绪${newsSummary.tone}（利好${newsSummary.positive}/利空${newsSummary.negative}/中性${newsSummary.neutral}）。`
  return [
    `综合近端走势（近1周 ${ranges.w1.toFixed(2)}%，近1月 ${ranges.m1.toFixed(2)}%，相对基准近1周超额 ${excess.w1 >= 0 ? '+' : ''}${excess.w1.toFixed(2)}%），短期研判${tone}。`,
    newsLine,
    signal === 'buy'
      ? '若量能与关键位配合，可关注趋势延续；否则易出现回调。'
      : signal === 'watch'
        ? '多空交织，宜等待方向更清晰后再评估。'
        : '下行或震荡风险仍在，优先观察企稳信号。',
    '以上为基于公开行情与多源资讯的信息整理，不构成投资建议。',
  ].join('')
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
  news: StockNewsItem[],
  companyIntro: string,
): StockRecommendation {
  const score = Math.max(0, Math.min(100, scoreFromRanges(quote.ranges) + newsScoreAdjust(news)))
  const signal = signalFor(score)
  const excess = excessRanges(quote.ranges, bench.ranges)
  const newsSummary = summarizeNewsSentiment(news)
  const sourceNames = newsSummary.sources.map((s) => NEWS_SOURCE_LABEL[s]).join('、')
  const reasons = [
    `区间表现：近1日 ${quote.ranges.d1.toFixed(2)}%，近1周 ${quote.ranges.w1.toFixed(2)}%，近1月 ${quote.ranges.m1.toFixed(2)}%，近3月 ${quote.ranges.m3.toFixed(2)}%，近6月 ${quote.ranges.m6.toFixed(2)}%，今年以来 ${quote.ranges.ytd.toFixed(2)}%。`,
    `相对基准超额：近1周 ${excess.w1 >= 0 ? '+' : ''}${excess.w1.toFixed(2)}%，近1月 ${excess.m1 >= 0 ? '+' : ''}${excess.m1.toFixed(2)}%，今年以来 ${excess.ytd >= 0 ? '+' : ''}${excess.ytd.toFixed(2)}%。`,
    news.length > 0
      ? `多源资讯综合（${sourceNames || '未知来源'}）：情绪${newsSummary.tone}，代表标题「${news[0]!.title}」。`
      : '暂无可用新闻，主要依据价格区间表现评估。',
  ]
  const risks = [
    '短期波动可能放大，需控制仓位并设置止损。',
    item.market === 'CN' ? 'A 股受政策与风格切换影响较大。' : '美股需留意财报和宏观利率预期。',
    newsSummary.tone === '偏利空'
      ? '多源资讯偏空，注意负面事件发酵与情绪共振风险。'
      : '单一来源可能片面，需持续交叉核对最新公告与行情。',
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
    companyIntro,
    outlook: zhOutlook(signal, quote.ranges, excess, news),
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
  companyIntro: z.string().optional(),
  outlook: z.string().optional(),
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
        max_tokens: 4000,
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
  const model = f.aiModel || firstModelId(provider.models) || 'gpt-4o-mini'

  const payload = {
    date: todayDate(),
    recommendations: base.map((r) => {
      const news = r.news.slice(0, 6)
      const newsSummary = summarizeNewsSentiment(
        news.map((n) => ({
          title: n.title,
          url: n.url,
          sentiment: n.sentiment,
          source: (n.source ?? 'eastmoney') as NewsSourceId,
        })),
      )
      return {
        market: r.market,
        symbol: r.symbol,
        name: r.name,
        score: r.score,
        price: r.price,
        currency: r.currency,
        ranges: r.ranges,
        companyIntro: r.companyIntro,
        outlook: r.outlook,
        newsConsensus: {
          sourceCount: newsSummary.sources.length,
          sources: newsSummary.sources.map((s) => NEWS_SOURCE_LABEL[s]),
          tone: newsSummary.tone,
          positive: newsSummary.positive,
          negative: newsSummary.negative,
          neutral: newsSummary.neutral,
        },
        news: news.map((n) => ({
          title: n.title,
          sentiment: n.sentiment,
          source: n.source ? NEWS_SOURCE_LABEL[n.source as NewsSourceId] ?? n.source : undefined,
        })),
      }
    }),
  }
  const schemaPrompt = [
    '你是股票信息整理助手。基于给定真实数据，输出 JSON（不要 Markdown 代码块）。',
    '要求：不构成投资建议；不能虚构价格/涨跌数字；不得只依据单一媒体下结论。',
    'JSON 结构：{"recommendations":[{"market":"CN|US","symbol":"...","signal":"buy|watch|avoid","outlook":"...","summary":"...","reasons":["..."],"risks":["..."]}]}',
    '每只股票必须包含：',
    '1) outlook：2～3 句中文「行情预测」——必须综合区间涨跌与多源资讯共识（newsConsensus + news），写短期/中期观察倾向，并标明非投资建议；',
    '2) summary：1 句总评；reasons：2～3 条（至少 1 条点明多源资讯交叉结论）；risks：2～3 条。',
    '若多源情绪分歧，请在 outlook/reasons 中明确写出分歧，不要只复述一条标题。',
    '公司简介已单独缓存，不要改写 companyIntro。',
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
      const nextIntro =
        typeof hit.companyIntro === 'string' && hit.companyIntro.trim()
          ? hit.companyIntro.trim()
          : item.companyIntro
      if (nextIntro && nextIntro !== item.companyIntro) {
        stocksStore.upsertCompanyProfile({
          market: item.market,
          symbol: item.symbol,
          name: item.name,
          companyIntro: nextIntro,
          source: 'ai',
        })
      }
      return {
        ...item,
        signal: normalizeAiSignal(String(hit.signal ?? item.signal)),
        companyIntro: nextIntro,
        outlook:
          typeof hit.outlook === 'string' && hit.outlook.trim() ? hit.outlook.trim() : item.outlook,
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
  const companyIntroMap = await resolveCompanyIntroMap(pool)

  const rawRecs: StockRecommendation[] = []
  const benchCache = new Map<'CN' | 'US', { symbol: string; ranges: StocksPriceRanges }>()
  let quoteFallbackCount = 0
  let newsHitCount = 0
  let cacheHitCount = 0

  for (const item of pool) {
    const introKey = `${item.market}|${item.symbol}`
    const companyIntro = companyIntroMap.get(introKey) ?? fallbackCompanyIntro(item)
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
          companyIntro,
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
          companyIntro,
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
      engine: 'stocks-v5/multi-source-news',
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

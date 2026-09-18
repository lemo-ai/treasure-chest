import { logger } from '../../../utils/logger'

const FETCH_HEADERS = {
  Accept: 'application/json, text/xml, text/html;q=0.8, */*',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
}

export interface StockQuoteHit {
  symbol: string
  name: string
  type?: string
  exchange?: string
  market: 'CN' | 'US' | 'HK' | 'OTHER'
  source: string
}

async function fetchText(url: string, timeoutMs = 20_000): Promise<string> {
  const res = await fetch(url, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(timeoutMs) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

async function fetchJson(url: string, timeoutMs = 14_000): Promise<unknown> {
  const res = await fetch(url, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(timeoutMs) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

function inferMarket(symbol: string, exch?: string): StockQuoteHit['market'] {
  const s = symbol.toUpperCase()
  const e = (exch || '').toUpperCase()
  if (
    s.endsWith('.SS') ||
    s.endsWith('.SZ') ||
    s.endsWith('.SH') ||
    e.includes('SHANGHAI') ||
    e.includes('SHENZHEN') ||
    e.includes('STAR') ||
    e.includes('科创') ||
    e.includes('上证') ||
    e.includes('深证')
  ) {
    return 'CN'
  }
  if (/^\d{6}$/.test(s)) return 'CN'
  if (s.endsWith('.HK') || e.includes('HKSE') || e.includes('HONG KONG')) return 'HK'
  if (
    !s.includes('.') &&
    (e.includes('NMS') || e.includes('NYQ') || e.includes('NASDAQ') || e.includes('NYSE') || e === 'NMS')
  ) {
    return 'US'
  }
  return 'OTHER'
}

/** Normalize A-share codes for Yahoo / get_stock_quote. */
export function normalizeCnYahooSymbol(raw: string): string {
  const s = raw.trim().toUpperCase()
  if (s.endsWith('.SH')) return s.replace(/\.SH$/, '.SS')
  if (s.endsWith('.SS') || s.endsWith('.SZ')) return s
  const m = s.match(/^(\d{6})$/)
  if (!m) return s
  const code = m[1]!
  if (code.startsWith('6') || code.startsWith('9')) return `${code}.SS`
  return `${code}.SZ`
}

function uniqQuotes(hits: StockQuoteHit[]): StockQuoteHit[] {
  const seen = new Set<string>()
  const out: StockQuoteHit[] = []
  for (const h of hits) {
    const key = `${h.market}|${h.symbol.toUpperCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(h)
  }
  return out
}

async function searchYahoo(query: string): Promise<{ quotes: StockQuoteHit[]; news: Array<{ title: string; url?: string; publisher?: string }> }> {
  const url =
    `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}` +
    `&quotesCount=12&newsCount=6&listsCount=0&enableFuzzyQuery=true`
  const json = (await fetchJson(url)) as {
    quotes?: Array<{
      symbol?: string
      shortname?: string
      longname?: string
      quoteType?: string
      exchDisp?: string
      exchange?: string
    }>
    news?: Array<{ title?: string; link?: string; publisher?: string }>
  }
  const quotes = (json.quotes ?? [])
    .filter((x) => x.symbol)
    .map((x) => ({
      symbol: x.symbol!,
      name: x.longname || x.shortname || '',
      type: x.quoteType,
      exchange: x.exchDisp || x.exchange,
      market: inferMarket(x.symbol || '', x.exchDisp || x.exchange),
      source: 'yahoo',
    }))
  const news = (json.news ?? [])
    .filter((n) => n.title)
    .slice(0, 6)
    .map((n) => ({ title: n.title!, url: n.link, publisher: n.publisher }))
  return { quotes, news }
}

/** Eastmoney suggest — better for A-share company names like 宇树科技. */
async function searchEastmoney(query: string): Promise<StockQuoteHit[]> {
  const url =
    `https://searchapi.eastmoney.com/api/suggest/get?input=${encodeURIComponent(query)}` +
    `&type=14&token=D43BF722C8E33BDC906FB84D85E326E8&count=10`
  const json = (await fetchJson(url)) as {
    QuotationCodeTable?: {
      Data?: Array<{ Code?: string; Name?: string; SecurityTypeName?: string; MktNum?: string }>
    }
  }
  const rows = json.QuotationCodeTable?.Data ?? []
  return rows
    .filter((r) => r.Code && /^\d{6}$/.test(r.Code))
    .map((r) => {
      const code = r.Code!
      const sh = r.MktNum === '1' || code.startsWith('6') || code.startsWith('9')
      return {
        symbol: sh ? `${code}.SH` : `${code}.SZ`,
        name: r.Name || '',
        type: r.SecurityTypeName,
        exchange: sh ? 'SSE' : 'SZSE',
        market: 'CN' as const,
        source: 'eastmoney',
      }
    })
}

async function searchSinaSuggest(query: string): Promise<StockQuoteHit[]> {
  const url = `https://suggest3.sinajs.cn/suggest/type=11,12,13,14,15&key=${encodeURIComponent(query)}`
  const text = await fetchText(url)
  const payload = text.split('"')[1] || ''
  if (!payload) return []
  return payload
    .split(';')
    .map((row) => row.split(','))
    .filter((p) => p.length >= 4 && /^\d{6}$/.test(p[3] || ''))
    .map((p) => {
      const code = p[3]!
      const flag = (p[0] || '').toLowerCase()
      const sh = flag.includes('sh') || code.startsWith('6') || code.startsWith('9')
      return {
        symbol: sh ? `${code}.SH` : `${code}.SZ`,
        name: p[4] || p[6] || '',
        exchange: sh ? 'SSE' : 'SZSE',
        market: 'CN' as const,
        source: 'sina',
      }
    })
}

export async function searchStockSymbols(query: string): Promise<string> {
  const q = query.trim()
  if (!q) return JSON.stringify({ error: 'query required' })

  const yahooQueries = [q]
  if (/[\u4e00-\u9fff]/.test(q) && !q.includes('股票')) yahooQueries.push(`${q} 股票`)

  const settled = await Promise.allSettled([
    ...yahooQueries.map((yq) => searchYahoo(yq)),
    searchEastmoney(q),
    searchSinaSuggest(q),
  ])

  const quotes: StockQuoteHit[] = []
  const news: Array<{ title: string; url?: string; publisher?: string }> = []
  const errors: string[] = []

  for (const item of settled) {
    if (item.status === 'rejected') {
      errors.push(item.reason instanceof Error ? item.reason.message : String(item.reason))
      continue
    }
    const val = item.value
    if (Array.isArray(val)) quotes.push(...val)
    else {
      quotes.push(...val.quotes)
      news.push(...val.news)
    }
  }

  const merged = uniqQuotes(quotes).slice(0, 12)
  return JSON.stringify({
    query: q,
    quotes: merged,
    news: news.slice(0, 6),
    lookupErrors: errors.length ? errors.slice(0, 3) : undefined,
    note:
      merged.length === 0
        ? 'Lookup returned no ticker THIS TIME. Do not conclude the company is unlisted — training data is often stale. Call search_web with “公司名 上市 股票代码”, then retry search_stock.'
        : 'For CN A-shares use market=CN and symbol like 688836.SH (Yahoo: 688836.SS). Then call get_stock_quote.',
  })
}

function parseRssItems(xml: string, limit: number): Array<{ title: string; url: string; source: string }> {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, limit)
  const out: Array<{ title: string; url: string; source: string }> = []
  for (const item of items) {
    const block = item[1] || ''
    const title = decodeXml(
      block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] ||
        block.match(/<title>(.*?)<\/title>/)?.[1] ||
        '',
    )
    const link = decodeXml(
      block.match(/<link>(.*?)<\/link>/)?.[1] ||
        block.match(/<link><!\[CDATA\[(.*?)\]\]><\/link>/)?.[1] ||
        '',
    )
    if (title) out.push({ title: title.trim(), url: link.trim(), source: 'rss' })
  }
  return out
}

function decodeXml(s: string): string {
  return s
    .replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

export async function searchWeb(query: string): Promise<string> {
  const q = query.trim()
  if (!q) return JSON.stringify({ error: 'query required' })

  const wikiLangs = /[\u4e00-\u9fff]/.test(q) ? (['zh', 'en'] as const) : (['en', 'zh'] as const)
  const newsHl = wikiLangs[0] === 'zh' ? 'zh-CN' : 'en-US'
  const newsGl = wikiLangs[0] === 'zh' ? 'CN' : 'US'
  const newsCeid = wikiLangs[0] === 'zh' ? 'CN:zh-Hans' : 'US:en'
  const newsQueries = [q]
  if (/[\u4e00-\u9fff]/.test(q) && !/上市|股票|IPO|竞彩|北单|足球/i.test(q)) {
    newsQueries.push(`${q} 上市 股票代码`)
  }
  if (/竞彩|北单|足球|让球|赔率/i.test(q)) {
    newsQueries.push(`${q} 分析`, `${q} 前瞻`)
  }

  const wikiHits: Array<{ title: string; url: string; snippet: string; source: string }> = []
  const newsHits: Array<{ title: string; url: string; source: string; snippet?: string }> = []
  const errors: string[] = []

  const parseDdgHtml = (html: string): Array<{ title: string; url: string; source: string; snippet?: string }> => {
    const out: Array<{ title: string; url: string; source: string; snippet?: string }> = []
    const re =
      /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(html)) && out.length < 10) {
      const href = decodeXml(m[1] || '').trim()
      const title = decodeXml(m[2] || '')
        .replace(/<[^>]+>/g, '')
        .trim()
      if (!title || !href) continue
      // DuckDuckGo redirect links
      let url = href
      const uddg = href.match(/[?&]uddg=([^&]+)/)
      if (uddg?.[1]) {
        try {
          url = decodeURIComponent(uddg[1])
        } catch {
          /* keep */
        }
      }
      if (!/^https?:\/\//i.test(url)) continue
      out.push({ title, url, source: 'duckduckgo' })
    }
    return out
  }

  await Promise.all([
    (async () => {
      for (const lang of wikiLangs) {
        try {
          const url =
            `https://${lang}.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(q)}` +
            `&limit=3&namespace=0&format=json`
          const data = (await fetchJson(url, 12_000)) as [string, string[], string[], string[]]
          const titles = data[1] ?? []
          const descs = data[2] ?? []
          const links = data[3] ?? []
          for (let i = 0; i < titles.length; i++) {
            wikiHits.push({
              title: titles[i]!,
              snippet: descs[i] || '',
              url: links[i] || '',
              source: `wikipedia-${lang}`,
            })
          }
          if (wikiHits.length) break
        } catch (err) {
          errors.push(`wikipedia-${lang}:${err instanceof Error ? err.message : String(err)}`)
          logger.warn(`wikipedia ${lang} search failed`, err)
        }
      }
    })(),
    ...newsQueries.flatMap((nq) => [
      (async () => {
        try {
          const url = `https://www.bing.com/news/search?q=${encodeURIComponent(nq)}&format=rss`
          const xml = await fetchText(url, 18_000)
          newsHits.push(...parseRssItems(xml, 8).map((x) => ({ ...x, source: 'bing-news' })))
        } catch (err) {
          errors.push(`bing:${err instanceof Error ? err.message : String(err)}`)
          logger.warn('bing news search failed', err)
        }
      })(),
      (async () => {
        try {
          const url = `https://news.google.com/rss/search?q=${encodeURIComponent(nq)}&hl=${newsHl}&gl=${newsGl}&ceid=${newsCeid}`
          const xml = await fetchText(url, 18_000)
          newsHits.push(...parseRssItems(xml, 8).map((x) => ({ ...x, source: 'google-news' })))
        } catch (err) {
          errors.push(`google-news:${err instanceof Error ? err.message : String(err)}`)
          logger.warn('google news search failed', err)
        }
      })(),
    ]),
    (async () => {
      try {
        const html = await fetchText(
          `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`,
          20_000,
        )
        newsHits.push(...parseDdgHtml(html))
      } catch (err) {
        errors.push(`duckduckgo:${err instanceof Error ? err.message : String(err)}`)
        logger.warn('duckduckgo search failed', err)
      }
    })(),
  ])

  const seenNews = new Set<string>()
  const dedupNews = newsHits.filter((n) => {
    const key = n.title.trim()
    if (!key || seenNews.has(key)) return false
    seenNews.add(key)
    return true
  })

  return JSON.stringify({
    query: q,
    retrievedAt: new Date().toISOString(),
    news: dedupNews.slice(0, 18),
    wikipedia: wikiHits.slice(0, 4),
    lookupErrors: errors.length ? errors.slice(0, 6) : undefined,
    note:
      dedupNews.length === 0
        ? 'Search returned few/no headlines. Retry search_web with different keywords, then crawl_url / fetch_url on concrete article URLs. Empty search ≠ no data online.'
        : 'Prefer crawl_url/fetch_url on the most relevant URLs before analyzing. Cite titles. Do not invent article content.',
  })
}

export async function fetchWebPage(urlRaw: string): Promise<string> {
  const { crawlUrl } = await import('../../crawl/webCrawl')
  const url = urlRaw.trim()
  if (!/^https?:\/\//i.test(url)) {
    return JSON.stringify({ error: 'url must start with http:// or https://' })
  }
  try {
    const result = await crawlUrl({ url, mode: 'text', maxChars: 8000, timeoutMs: 18_000 })
    if (!result.ok) {
      return JSON.stringify({ error: result.error || 'fetch failed', url })
    }
    return JSON.stringify({
      url: result.finalUrl || url,
      title: result.title || '',
      text: result.text || '',
      retrievedAt: result.retrievedAt,
      truncated: Boolean(result.truncated),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.warn(`fetchWebPage failed: ${msg}`)
    return JSON.stringify({ error: msg, url })
  }
}

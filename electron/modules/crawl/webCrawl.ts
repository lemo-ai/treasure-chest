/**
 * Universal HTML crawler: fetch with charset detection, extract text / tables / links.
 * Shared by agent `crawl_url` / `fetch_url` and the Toolbox crawler page.
 */
import { logger } from '../../utils/logger'

export type CrawlExtractMode = 'text' | 'tables' | 'links' | 'auto'

export interface CrawlUrlOptions {
  url: string
  /** Extraction mode (default auto = text + tables + links summary). */
  mode?: CrawlExtractMode
  /** Max characters of extracted text (default 24000). */
  maxChars?: number
  /** Max HTML tables to return (default 12). */
  maxTables?: number
  /** Max links to return (default 40). */
  maxLinks?: number
  /** Request timeout ms (default 25000). */
  timeoutMs?: number
  /** Optional Referer. */
  referer?: string
  /** Force charset (e.g. gb18030); otherwise sniff Content-Type / meta. */
  encoding?: string
}

export interface CrawlTable {
  headers: string[]
  rows: string[][]
  caption?: string
}

export interface CrawlLink {
  href: string
  text: string
}

export interface CrawlResult {
  ok: boolean
  url: string
  finalUrl?: string
  status?: number
  contentType?: string | null
  encoding?: string
  title?: string
  text?: string
  tables?: CrawlTable[]
  links?: CrawlLink[]
  truncated?: boolean
  retrievedAt: string
  error?: string
}

const DEFAULT_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(Number.parseInt(h, 16)))
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
}

function sniffCharset(contentType: string | null, buf: Buffer): string | null {
  const ct = (contentType || '').toLowerCase()
  const m = ct.match(/charset\s*=\s*["']?([a-z0-9_-]+)/i)
  if (m?.[1]) return normalizeCharset(m[1])
  const head = buf.subarray(0, Math.min(buf.length, 4096)).toString('latin1')
  const meta =
    head.match(/<meta[^>]+charset\s*=\s*["']?\s*([a-z0-9_-]+)/i) ||
    head.match(/<meta[^>]+content\s*=\s*["'][^"']*charset\s*=\s*([a-z0-9_-]+)/i)
  if (meta?.[1]) return normalizeCharset(meta[1])
  return null
}

function normalizeCharset(raw: string): string {
  const c = raw.trim().toLowerCase().replace(/_/g, '-')
  if (c === 'gb2312' || c === 'gbk' || c === 'gb-2312') return 'gb18030'
  if (c === 'utf8') return 'utf-8'
  return c
}

function decodeBuffer(buf: Buffer, encoding: string | null | undefined): { text: string; encoding: string } {
  const tryList = [encoding, 'utf-8', 'gb18030'].filter(Boolean) as string[]
  for (const enc of tryList) {
    try {
      return { text: new TextDecoder(enc).decode(buf), encoding: enc }
    } catch {
      /* try next */
    }
  }
  return { text: buf.toString('utf8'), encoding: 'utf-8' }
}

/** Low-level HTML fetch with charset handling. */
export async function fetchHtml(
  url: string,
  opts?: {
    timeoutMs?: number
    referer?: string
    encoding?: string
    headers?: Record<string, string>
  },
): Promise<{ html: string; status: number; contentType: string | null; encoding: string; finalUrl: string }> {
  const res = await fetch(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'User-Agent': DEFAULT_UA,
      ...(opts?.referer ? { Referer: opts.referer } : {}),
      ...opts?.headers,
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(opts?.timeoutMs ?? 25_000),
  })
  const buf = Buffer.from(await res.arrayBuffer())
  const contentType = res.headers.get('content-type')
  const sniffed = opts?.encoding ? normalizeCharset(opts.encoding) : sniffCharset(contentType, buf)
  const { text, encoding } = decodeBuffer(buf, sniffed)
  return {
    html: text,
    status: res.status,
    contentType,
    encoding,
    finalUrl: res.url || url,
  }
}

function extractTitle(html: string): string {
  return stripTags(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '')
}

function extractText(html: string, maxChars: number): { text: string; truncated: boolean } {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
  const text = stripTags(cleaned)
  if (text.length <= maxChars) return { text, truncated: false }
  return { text: text.slice(0, maxChars), truncated: true }
}

function cellTexts(rowHtml: string): string[] {
  return [...rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) => stripTags(m[1] || ''))
}

export function extractTables(html: string, maxTables: number): CrawlTable[] {
  const out: CrawlTable[] = []
  const tableRe = /<table\b[^>]*>([\s\S]*?)<\/table>/gi
  let tm: RegExpExecArray | null
  while ((tm = tableRe.exec(html)) && out.length < maxTables) {
    const body = tm[1] || ''
    const caption = stripTags(body.match(/<caption[^>]*>([\s\S]*?)<\/caption>/i)?.[1] || '') || undefined
    const rowsHtml = [...body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => m[1] || '')
    if (!rowsHtml.length) continue
    const matrix = rowsHtml.map(cellTexts).filter((r) => r.some((c) => c.length > 0))
    if (!matrix.length) continue
    const headerish = matrix[0]!.every((c) => c.length < 40) && matrix.length > 1
    const headers = headerish ? matrix[0]! : matrix[0]!.map((_, i) => `col_${i + 1}`)
    const rows = headerish ? matrix.slice(1) : matrix
    out.push({ headers, rows: rows.slice(0, 200), caption })
  }
  return out
}

export function extractLinks(html: string, baseUrl: string, maxLinks: number): CrawlLink[] {
  const out: CrawlLink[] = []
  const seen = new Set<string>()
  const re = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) && out.length < maxLinks) {
    const raw = (m[1] || '').trim()
    if (!raw || raw.startsWith('#') || raw.toLowerCase().startsWith('javascript:')) continue
    let href = raw
    try {
      href = new URL(raw, baseUrl).href
    } catch {
      continue
    }
    if (!/^https?:\/\//i.test(href)) continue
    if (seen.has(href)) continue
    seen.add(href)
    out.push({ href, text: stripTags(m[2] || '').slice(0, 120) })
  }
  return out
}

/** Crawl a public URL and return structured extraction. */
export async function crawlUrl(opts: CrawlUrlOptions): Promise<CrawlResult> {
  const url = (opts.url || '').trim()
  const retrievedAt = new Date().toISOString()
  if (!/^https?:\/\//i.test(url)) {
    return { ok: false, url, retrievedAt, error: 'url must start with http:// or https://' }
  }

  const mode: CrawlExtractMode = opts.mode || 'auto'
  const maxChars = Math.max(1_000, Math.min(opts.maxChars ?? 24_000, 80_000))
  const maxTables = Math.max(1, Math.min(opts.maxTables ?? 12, 40))
  const maxLinks = Math.max(1, Math.min(opts.maxLinks ?? 40, 100))

  try {
    const fetched = await fetchHtml(url, {
      timeoutMs: opts.timeoutMs ?? 25_000,
      referer: opts.referer,
      encoding: opts.encoding,
    })
    if (!fetched.status || fetched.status >= 400) {
      return {
        ok: false,
        url,
        finalUrl: fetched.finalUrl,
        status: fetched.status,
        contentType: fetched.contentType,
        encoding: fetched.encoding,
        retrievedAt,
        error: `HTTP ${fetched.status}`,
      }
    }

    const title = extractTitle(fetched.html)
    const result: CrawlResult = {
      ok: true,
      url,
      finalUrl: fetched.finalUrl,
      status: fetched.status,
      contentType: fetched.contentType,
      encoding: fetched.encoding,
      title,
      retrievedAt,
    }

    if (mode === 'text' || mode === 'auto') {
      const { text, truncated } = extractText(fetched.html, maxChars)
      result.text = text
      result.truncated = truncated
    }
    if (mode === 'tables' || mode === 'auto') {
      result.tables = extractTables(fetched.html, maxTables)
    }
    if (mode === 'links' || mode === 'auto') {
      result.links = extractLinks(fetched.html, fetched.finalUrl || url, maxLinks)
    }

    return result
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.warn(`crawlUrl failed: ${msg}`)
    return { ok: false, url, retrievedAt, error: msg }
  }
}

/** JSON string for LLM tools. */
export async function crawlUrlForTool(args: {
  url?: string
  mode?: string
  maxChars?: number
}): Promise<string> {
  const modeRaw = (args.mode || 'auto').toLowerCase()
  const mode: CrawlExtractMode =
    modeRaw === 'text' || modeRaw === 'tables' || modeRaw === 'links' || modeRaw === 'auto'
      ? modeRaw
      : 'auto'
  const result = await crawlUrl({
    url: String(args.url || ''),
    mode,
    maxChars: typeof args.maxChars === 'number' ? args.maxChars : undefined,
  })
  // Keep payload lean for the model
  if (result.tables) {
    result.tables = result.tables.map((t) => ({
      ...t,
      rows: t.rows.slice(0, 80),
    }))
  }
  return JSON.stringify(result)
}

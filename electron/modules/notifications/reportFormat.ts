/** Shared helpers for schedule / inbox report formatting. */

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Lightweight markdown → HTML for agent schedule reports (main process, no DOM). */
export function markdownToSimpleHtml(md: string): string {
  const lines = String(md || '').replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let inList = false

  const flushList = (): void => {
    if (inList) {
      out.push('</ul>')
      inList = false
    }
  }

  const inline = (text: string): string =>
    escapeHtml(text)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')

  for (const raw of lines) {
    const line = raw.trimEnd()
    if (!line.trim()) {
      flushList()
      continue
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line.trim())
    if (heading) {
      flushList()
      const level = heading[1]!.length
      out.push(`<h${level}>${inline(heading[2]!)}</h${level}>`)
      continue
    }
    const bullet = /^[-*]\s+(.+)$/.exec(line.trim())
    if (bullet) {
      if (!inList) {
        out.push('<ul>')
        inList = true
      }
      out.push(`<li>${inline(bullet[1]!)}</li>`)
      continue
    }
    flushList()
    out.push(`<p>${inline(line.trim())}</p>`)
  }
  flushList()
  return out.join('\n')
}

export function scheduleReportShell(body: string, locale: string): string {
  const en = locale.toLowerCase().startsWith('en')
  return `<!DOCTYPE html><html lang="${en ? 'en' : 'zh-CN'}"><head><meta charset="utf-8"/><style>
  :root{color-scheme:light dark;--ink:#1a1f2c;--muted:#5b6475;--card:#fff;--line:#e6eaf0;--brand:#0d9488;--soft:#f0faf8}
  @media(prefers-color-scheme:dark){:root{--ink:#e8eef8;--muted:#9aa6b8;--card:#151b24;--line:#2a3342;--soft:#10201d}}
  body{margin:0;font:15px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Noto Sans SC",sans-serif;color:var(--ink);background:transparent}
  .wrap{padding:4px 2px 12px}
  .hero{padding:1.1rem 1.15rem;border-radius:1rem;background:linear-gradient(135deg,color-mix(in srgb,var(--brand) 18%,var(--soft)),var(--soft));border:1px solid var(--line);margin-bottom:1rem}
  .hero h1{margin:0 0 .35rem;font-size:1.35rem;letter-spacing:-.02em}
  .meta{color:var(--muted);font-size:.82rem}
  .card{background:var(--card);border:1px solid var(--line);border-radius:.9rem;padding:.95rem 1rem;margin:0 0 .75rem}
  .card h2,.card h3{margin:0 0 .55rem;font-size:1rem}
  .card p{margin:.35rem 0}
  .card ul{margin:.35rem 0 0;padding-left:1.15rem}
  .card li{margin:.2rem 0}
  .card code{font-size:.88em;padding:.1em .35em;border-radius:.3em;background:var(--soft)}
  </style></head><body><div class="wrap">${body}</div></body></html>`
}

/**
 * DingTalk robots only accept markdown (not HTML).
 * Strip tags / styles into readable markdown-ish text.
 */
export function htmlToDingTalkText(html: string): string {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<\/(p|div|section|article|tr|table|h[1-6])>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<h[1-6][^>]*>/gi, '\n### ')
    .replace(/<(strong|b)[^>]*>/gi, '**')
    .replace(/<\/(strong|b)>/gi, '**')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

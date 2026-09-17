import { Notification } from 'electron'
import { getEnabledOpenMarkets } from '@shared'
import { getSetting, setSetting } from '../../db/AppSettingsRepo'
import { settingsStore } from '../settings/SettingsStore'
import { generateStocksReportFromWatchlist } from '../stocks/StocksService'
import { logger } from '../../utils/logger'

function todayYmd(): string {
  const n = new Date()
  const pad = (v: number) => String(v).padStart(2, '0')
  return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`
}

function signalLabel(signal: string, locale: string): string {
  const en = locale.toLowerCase().startsWith('en')
  if (signal === 'buy') return en ? 'Buy' : '关注买入'
  if (signal === 'watch') return en ? 'Watch' : '观望'
  if (signal === 'avoid') return en ? 'Avoid' : '回避'
  return signal || (en ? '—' : '—')
}

function marketLabel(market: string, locale: string): string {
  if (locale.toLowerCase().startsWith('en')) {
    return market === 'CN' ? 'A-share' : market === 'US' ? 'US' : market
  }
  return market === 'CN' ? 'A股' : market === 'US' ? '美股' : market
}

function formatPrice(price: number, currency: string): string {
  if (!Number.isFinite(price) || price <= 0) return ''
  const cur = currency || ''
  return `${cur}${price.toFixed(cur === '¥' || cur === 'CNY' ? 2 : 2)}`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function stocksReportShell(body: string, locale: string): string {
  const en = locale.toLowerCase().startsWith('en')
  return `<!DOCTYPE html><html lang="${en ? 'en' : 'zh-CN'}"><head><meta charset="utf-8"/><style>
  :root{color-scheme:light dark;--ink:#1a1f2c;--muted:#5b6475;--card:#fff;--line:#e6eaf0;--brand:#0f766e;--soft:#eef8f5;--buy:#15803d;--watch:#a16207;--avoid:#b91c1c}
  @media(prefers-color-scheme:dark){:root{--ink:#e8eef8;--muted:#9aa6b8;--card:#151b24;--line:#2a3342;--soft:#10201d}}
  body{margin:0;font:15px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Noto Sans SC",sans-serif;color:var(--ink);background:transparent}
  .wrap{padding:4px 2px 12px}
  .hero{padding:1.1rem 1.15rem;border-radius:1rem;background:linear-gradient(135deg,color-mix(in srgb,var(--brand) 16%,var(--soft)),var(--soft));border:1px solid var(--line);margin-bottom:1rem}
  .hero h1{margin:0 0 .35rem;font-size:1.28rem}
  .meta{color:var(--muted);font-size:.82rem}
  .card{background:var(--card);border:1px solid var(--line);border-radius:.9rem;padding:.95rem 1rem;margin:0 0 .75rem}
  .card h2{margin:0 0 .35rem;font-size:1.02rem}
  .chips{display:flex;flex-wrap:wrap;gap:.35rem;margin:.35rem 0 .55rem}
  .chip{font-size:.72rem;font-weight:720;padding:.18rem .45rem;border-radius:999px;background:var(--soft);color:var(--muted)}
  .chip.buy{color:var(--buy);background:color-mix(in srgb,var(--buy) 12%,transparent)}
  .chip.watch{color:var(--watch);background:color-mix(in srgb,var(--watch) 12%,transparent)}
  .chip.avoid{color:var(--avoid);background:color-mix(in srgb,var(--avoid) 12%,transparent)}
  .score{font-weight:780;color:var(--brand)}
  ul{margin:.35rem 0 0;padding-left:1.15rem}
  li{margin:.18rem 0}
  .foot{color:var(--muted);font-size:.78rem;margin-top:.75rem}
  </style></head><body><div class="wrap">${body}</div></body></html>`
}

function buildStocksReport(
  locale: string,
  report: {
    date: string
    disclaimer?: string
    recommendations: Array<{
      market: string
      symbol: string
      name?: string
      signal: string
      score: number
      price?: number
      currency?: string
      summary?: string
      outlook?: string
      companyIntro?: string
      reasons?: string[]
      risks?: string[]
    }>
  },
  format: 'html' | 'markdown' = 'html',
): { summary: string; detail: string; detailFormat: 'html' | 'markdown' } {
  const en = locale.toLowerCase().startsWith('en')
  const picks = (report.recommendations || []).slice(0, 12)
  const summary = en ? `${picks.length} pick(s) ready` : `共 ${picks.length} 条推荐`

  if (format === 'markdown') {
    const sections = picks.map((r, i) => {
      const title = `### ${i + 1}. ${r.symbol}${r.name ? ` · ${r.name}` : ''}`
      const meta = [
        `**${marketLabel(r.market, locale)}**`,
        `**${signalLabel(r.signal, locale)}**`,
        en ? `Score **${r.score}**` : `评分 **${r.score}**`,
        r.price != null && r.price > 0
          ? en
            ? `Price **${formatPrice(r.price, r.currency || '')}**`
            : `现价 **${formatPrice(r.price, r.currency || '')}**`
          : '',
      ]
        .filter(Boolean)
        .join(' · ')
      const body: string[] = [title, meta]
      if (r.summary?.trim()) body.push('', r.summary.trim())
      if (r.outlook?.trim()) {
        body.push('', en ? `**Outlook:** ${r.outlook.trim()}` : `**展望：** ${r.outlook.trim()}`)
      }
      const reasons = (r.reasons || []).map((x) => String(x || '').trim()).filter(Boolean)
      if (reasons.length) body.push('', en ? '**Why**' : '**看多理由**', ...reasons.map((x) => `- ${x}`))
      const risks = (r.risks || []).map((x) => String(x || '').trim()).filter(Boolean)
      if (risks.length) body.push('', en ? '**Risks**' : '**风险提示**', ...risks.map((x) => `- ${x}`))
      return body.join('\n')
    })
    const detail = [
      en ? `## Daily stock picks · ${report.date}` : `## 每日荐股 · ${report.date}`,
      en
        ? `Generated ${picks.length} recommendation(s). Informational only — not investment advice.`
        : `共生成 ${picks.length} 条推荐。以下内容仅供参考，不构成投资建议。`,
      '',
      ...sections,
      report.disclaimer ? `\n---\n\n*${report.disclaimer.replace(/\n+/g, ' ').trim()}*` : '',
    ]
      .filter((x, idx, arr) => !(x === '' && arr[idx - 1] === ''))
      .join('\n')
    return { summary, detail, detailFormat: 'markdown' }
  }

  const cards = picks
    .map((r) => {
      const signalClass =
        r.signal === 'buy' ? 'buy' : r.signal === 'avoid' ? 'avoid' : 'watch'
      const reasons = (r.reasons || []).map((x) => String(x || '').trim()).filter(Boolean)
      const risks = (r.risks || []).map((x) => String(x || '').trim()).filter(Boolean)
      return `<article class="card">
        <h2>${escapeHtml(r.symbol)}${r.name ? ` · ${escapeHtml(r.name)}` : ''}</h2>
        <div class="chips">
          <span class="chip">${escapeHtml(marketLabel(r.market, locale))}</span>
          <span class="chip ${signalClass}">${escapeHtml(signalLabel(r.signal, locale))}</span>
          <span class="chip score">${en ? 'Score' : '评分'} ${r.score}</span>
          ${r.price != null && r.price > 0 ? `<span class="chip">${escapeHtml(formatPrice(r.price, r.currency || ''))}</span>` : ''}
        </div>
        ${r.summary?.trim() ? `<p>${escapeHtml(r.summary.trim())}</p>` : ''}
        ${r.outlook?.trim() ? `<p><strong>${en ? 'Outlook' : '展望'}：</strong>${escapeHtml(r.outlook.trim())}</p>` : ''}
        ${reasons.length ? `<div><strong>${en ? 'Why' : '看多理由'}</strong><ul>${reasons.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul></div>` : ''}
        ${risks.length ? `<div><strong>${en ? 'Risks' : '风险提示'}</strong><ul>${risks.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul></div>` : ''}
      </article>`
    })
    .join('')

  const body = `
    <section class="hero">
      <h1>${en ? 'Daily stock picks' : '每日荐股'}</h1>
      <div class="meta">${escapeHtml(report.date)} · ${en ? `${picks.length} picks` : `${picks.length} 条推荐`}</div>
      <p class="foot">${en ? 'Informational only — not investment advice.' : '仅供参考，不构成投资建议。'}</p>
    </section>
    ${cards}
    ${report.disclaimer ? `<p class="foot">${escapeHtml(report.disclaimer.replace(/\n+/g, ' ').trim())}</p>` : ''}
  `

  return {
    summary,
    detail: stocksReportShell(body, locale),
    detailFormat: 'html',
  }
}

function closedMarketsReport(
  locale: string,
  closed: Array<{ market: string; reason?: string }>,
  format: 'html' | 'markdown' = 'html',
): { summary: string; detail: string; detailFormat: 'html' | 'markdown' } {
  const en = locale.toLowerCase().startsWith('en')
  const summary = en ? 'Markets closed today' : '今日开市市场均休市'
  if (format === 'markdown') {
    return {
      summary,
      detailFormat: 'markdown',
      detail: [
        en ? '## Markets closed' : '## 今日休市',
        en ? 'All enabled markets are closed today.' : '当前已开启的市场今日均休市，未生成荐股。',
        '',
        ...closed.map((c) => {
          const reason = (c.reason || (en ? 'closed' : '休市')).trim()
          return `- **${marketLabel(c.market, locale)}**：${reason}`
        }),
      ].join('\n'),
    }
  }
  const lines = closed
    .map((c) => {
      const reason = (c.reason || (en ? 'closed' : '休市')).trim()
      return `<li><strong>${escapeHtml(marketLabel(c.market, locale))}</strong>：${escapeHtml(reason)}</li>`
    })
    .join('')
  const body = `<section class="hero"><h1>${en ? 'Markets closed' : '今日休市'}</h1>
    <p>${en ? 'All enabled markets are closed today.' : '当前已开启的市场今日均休市，未生成荐股。'}</p>
    <ul>${lines}</ul></section>`
  return { summary, detail: stocksReportShell(body, locale), detailFormat: 'html' }
}

function notifyCopy(locale: string, count: number): { title: string; body: string } {
  if (locale.startsWith('en')) {
    return {
      title: 'Daily stock report ready',
      body: `${count} pick(s) generated. Open Qiankun to review.`,
    }
  }
  return {
    title: '今日荐股报告已生成',
    body: `共 ${count} 条推荐，打开袖里乾坤查看详情。`,
  }
}

let running = false
let timer: ReturnType<typeof setInterval> | null = null

export async function checkStocksAutoGenerate(opts?: {
  desktopNotify?: boolean
  force?: boolean
  format?: 'html' | 'markdown'
}): Promise<{
  ok: boolean
  count: number
  skipped?: string
  summary?: string
  detail?: string
  detailFormat?: 'html' | 'markdown'
}> {
  const format = opts?.format === 'markdown' ? 'markdown' : 'html'
  const cfg = settingsStore.getStocksSettings()
  if (!cfg.autoGenerate && !opts?.force) return { ok: false, count: 0, skipped: 'disabled' }

  const today = todayYmd()
  const last = getSetting<string>('stocks.lastAutoReportDate', '')
  if (last === today && !opts?.force) return { ok: false, count: 0, skipped: 'already_today' }

  const hour = new Date().getHours()
  if (!opts?.force && hour < cfg.autoGenerateHour) return { ok: false, count: 0, skipped: 'before_hour' }

  const { open, closed } = getEnabledOpenMarkets({
    CN: cfg.marketCN,
    US: cfg.marketUS,
  }, today)

  if (open.length === 0) {
    setSetting('stocks.lastAutoReportDate', today)
    logger.info(
      `stocks auto-generate skipped (all markets closed): ${closed.map((c) => `${c.market}:${c.reason}`).join(', ')}`,
    )
    const locale = settingsStore.getLocale()
    const closedCopy = closedMarketsReport(locale, closed, format)
    return {
      ok: false,
      count: 0,
      skipped: 'markets_closed',
      summary: closedCopy.summary,
      detail: closedCopy.detail,
      detailFormat: closedCopy.detailFormat,
    }
  }

  if (running) return { ok: false, count: 0, skipped: 'busy' }

  running = true
  try {
    logger.info(`stocks auto-generate started (open=${open.join(',')})`)
    try {
      const { refreshScannerPool } = await import('./ScannerService')
      const scan = await refreshScannerPool()
      logger.info(`scanner pre-refresh added=${scan.added} scanned=${scan.scanned}`)
    } catch (err) {
      logger.warn('scanner pre-refresh failed', err)
    }
    const report = await generateStocksReportFromWatchlist()
    setSetting('stocks.lastAutoReportDate', today)
    logger.info(`stocks auto-generate done count=${report.recommendations.length}`)

    const locale = settingsStore.getLocale()
    const picks = (report.recommendations || []).slice(0, 12)
    const { summary, detail, detailFormat } = buildStocksReport(locale, report, format)

    const desktopNotify = opts?.desktopNotify !== false
    const { stocksDaily } = settingsStore.getNotifications()
    if (desktopNotify && stocksDaily && Notification.isSupported() && picks.length > 0) {
      const { title, body } = notifyCopy(locale, picks.length)
      new Notification({ title, body }).show()
      setSetting('notifications.lastStocksReportDate', today)
    }

    return { ok: true, count: picks.length, summary, detail, detailFormat }
  } catch (err) {
    logger.warn('stocks auto-generate failed', err)
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, count: 0, skipped: 'error', summary: msg, detail: msg, detailFormat: 'markdown' }
  } finally {
    running = false
  }
}

/** Notify after a manual generate if stocksDaily is on and not yet notified today. */
export function notifyStocksReportIfNeeded(count: number): void {
  const { stocksDaily } = settingsStore.getNotifications()
  if (!stocksDaily || !Notification.isSupported()) return
  if (count <= 0) return
  const today = todayYmd()
  const last = getSetting<string>('notifications.lastStocksReportDate', '')
  if (last === today) return
  try {
    const { title, body } = notifyCopy(settingsStore.getLocale(), count)
    new Notification({ title, body }).show()
    setSetting('notifications.lastStocksReportDate', today)
  } catch (err) {
    logger.warn('stocks notification failed', err)
  }
}

export function startStocksScheduler(): void {
  void checkStocksAutoGenerate()
  if (timer) clearInterval(timer)
  timer = setInterval(() => {
    void checkStocksAutoGenerate()
  }, 60_000)
}

export function stopStocksScheduler(): void {
  if (timer) clearInterval(timer)
  timer = null
}

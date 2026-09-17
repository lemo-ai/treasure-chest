import type { BirthProfile, FortuneAspect, FortuneAspectKey, FortuneLevel, FortuneSettings } from '@shared'
import { Notification } from 'electron'
import { getSetting, setSetting } from '../../db/AppSettingsRepo'
import { fortuneStore } from '../fortune/FortuneStore'
import { computeDailyFortune } from '../../../src/features/fortune/lib/FortuneService'
import { settingsStore } from '../settings/SettingsStore'
import { logger } from '../../utils/logger'

function todayYmd(): string {
  const n = new Date()
  const pad = (v: number) => String(v).padStart(2, '0')
  return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`
}

function isEn(locale: string): boolean {
  return locale.toLowerCase().startsWith('en')
}

function aspectName(key: string, locale: string): string {
  const zh: Record<string, string> = {
    career: '事业 / 学业',
    wealth: '财运',
    relationship: '感情 / 人际',
    health: '健康',
    mood: '情绪',
  }
  const en: Record<string, string> = {
    career: 'Career / study',
    wealth: 'Wealth',
    relationship: 'Relationships',
    health: 'Health',
    mood: 'Mood',
  }
  return (isEn(locale) ? en : zh)[key] || key
}

function levelLabel(level: FortuneLevel | string, locale: string): string {
  if (isEn(locale)) {
    const map: Record<string, string> = {
      excellent: 'Excellent',
      good: 'Good',
      fair: 'Fair',
      caution: 'Caution',
    }
    return map[level] || String(level)
  }
  const map: Record<string, string> = {
    excellent: '优',
    good: '良',
    fair: '平',
    caution: '慎',
  }
  return map[level] || String(level)
}

function tendencyLabel(tendency: string, locale: string): string {
  if (isEn(locale)) {
    const map: Record<string, string> = {
      rising: 'Rising',
      steady: 'Steady',
      mixed: 'Mixed',
      falling: 'Falling',
    }
    return map[tendency] || tendency
  }
  const map: Record<string, string> = {
    rising: '升',
    steady: '稳',
    mixed: '变',
    falling: '降',
  }
  return map[tendency] || tendency
}

function notifyCopy(locale: string): { title: string; body: string } {
  if (isEn(locale)) {
    return {
      title: 'Daily fortune updated',
      body: 'Open Qiankun to read today’s hexagram and scores.',
    }
  }
  return {
    title: '今日运势已更新',
    body: '打开袖里乾坤查看今日卦象与分项运势。',
  }
}

export type FortuneNotifyResult = {
  sent: boolean
  skipped?: string
  summary?: string
  detail?: string
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function reportShell(_title: string, body: string, locale: string): string {
  const en = isEn(locale)
  return `<!DOCTYPE html><html lang="${en ? 'en' : 'zh-CN'}"><head><meta charset="utf-8"/><style>
  :root{color-scheme:light dark;--ink:#1a1f2c;--muted:#5b6475;--card:#fff;--line:#e6eaf0;--brand:#0d9488;--soft:#f0faf8}
  @media(prefers-color-scheme:dark){:root{--ink:#e8eef8;--muted:#9aa6b8;--card:#151b24;--line:#2a3342;--soft:#10201d}}
  body{margin:0;font:15px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Noto Sans SC",sans-serif;color:var(--ink);background:transparent}
  .wrap{padding:4px 2px 12px}
  .hero{padding:1.1rem 1.15rem;border-radius:1rem;background:linear-gradient(135deg,color-mix(in srgb,var(--brand) 18%,var(--soft)),var(--soft));border:1px solid var(--line);margin-bottom:1rem}
  .hero h1{margin:0 0 .35rem;font-size:1.35rem;letter-spacing:-.02em}
  .meta{color:var(--muted);font-size:.82rem}
  .card{background:var(--card);border:1px solid var(--line);border-radius:.9rem;padding:.95rem 1rem;margin:0 0 .75rem}
  .card h2{margin:0 0 .55rem;font-size:1rem}
  .score{display:inline-flex;align-items:center;gap:.35rem;font-weight:750;color:var(--brand)}
  .grid{display:grid;gap:.55rem}
  .row{display:grid;grid-template-columns:1fr auto;gap:.5rem;padding:.55rem .65rem;border-radius:.7rem;background:var(--soft)}
  .row strong{font-weight:700}
  .muted{color:var(--muted)}
  .quote{margin:.4rem 0 0;padding:.55rem .75rem;border-left:3px solid var(--brand);color:var(--muted);background:color-mix(in srgb,var(--brand) 6%,transparent);border-radius:0 .55rem .55rem 0}
  ul{margin:.35rem 0 0;padding-left:1.15rem}
  li{margin:.2rem 0}
  </style></head><body><div class="wrap">${body}</div></body></html>`
}

/** Build fortune inbox copy. Default format is HTML for readability. */
export function buildFortuneInboxCopy(
  locale: string,
  opts?: { format?: 'html' | 'markdown' },
): {
  ok: boolean
  summary: string
  detail: string
  detailFormat: 'html' | 'markdown'
  reason?: string
} {
  const format = opts?.format === 'markdown' ? 'markdown' : 'html'
  const profile = fortuneStore.getProfile() as BirthProfile | null
  if (!profile) {
    const detail = isEn(locale)
      ? 'Set a birth profile in Fortune settings, then run again.'
      : '请先在运势设置中填写生辰档案，然后再执行。'
    return {
      ok: false,
      summary: isEn(locale) ? 'No birth profile' : '尚未配置生辰档案',
      detail: format === 'html' ? reportShell('err', `<div class="card"><p>${escapeHtml(detail)}</p></div>`, locale) : detail,
      detailFormat: format,
      reason: 'no_profile',
    }
  }
  const settings = settingsStore.getFortuneSettings() as FortuneSettings
  const fortune = computeDailyFortune(profile, undefined, locale, settings)
  if (!fortune) {
    const detail = isEn(locale)
      ? 'Fortune engine returned empty for this profile.'
      : '运势引擎未能根据当前档案计算出结果。'
    return {
      ok: false,
      summary: isEn(locale) ? 'Could not compute fortune' : '无法计算今日运势',
      detail: format === 'html' ? reportShell('err', `<div class="card"><p>${escapeHtml(detail)}</p></div>`, locale) : detail,
      detailFormat: format,
      reason: 'compute_failed',
    }
  }
  fortuneStore.cacheDailyFortune(fortune)
  const name = isEn(locale)
    ? fortune.hexagram.nameEn || fortune.hexagram.nameFull
    : fortune.hexagram.nameFull
  const overallLvl = levelLabel(fortune.overall.level, locale)
  const tendency = tendencyLabel(String(fortune.hexagram.tendency || ''), locale)
  const summary =
    `${name} · ${fortune.overall.blurb || overallLvl} (${fortune.overall.score})`.trim()

  const aspectEntries = (
    Object.entries(fortune.aspects || {}) as Array<[FortuneAspectKey | string, FortuneAspect]>
  )
    .slice(0, 8)
    .sort((a, b) => (b[1]?.score ?? 0) - (a[1]?.score ?? 0))

  if (format === 'markdown') {
    const aspectLines = aspectEntries.map(([key, a]) => {
      const label = aspectName(String(key), locale)
      const lvl = levelLabel(a.level, locale)
      const blurb = a.blurb?.trim() ? ` — ${a.blurb.trim()}` : ''
      return `- **${label}** · ${a.score}（${lvl}）${blurb}`
    })
    const detail = isEn(locale)
      ? [
          `## ${name}`,
          `**Date** ${fortune.date} · **Trend** ${tendency}`,
          '',
          `### Overall · ${fortune.overall.score}（${overallLvl}）`,
          fortune.overall.blurb || '',
          fortune.hexagram.summary ? `\n> ${fortune.hexagram.summary}` : '',
          fortune.hexagram.advice ? `\n**Advice:** ${fortune.hexagram.advice}` : '',
          aspectLines.length ? `\n### Aspects\n\n${aspectLines.join('\n')}` : '',
          `\n### Lucky cues`,
          `- **Colors:** ${fortune.lucky.colors.join(', ') || '—'}`,
          `- **Numbers:** ${fortune.lucky.numbers.join(', ') || '—'}`,
          `- **Directions:** ${fortune.lucky.directions.join(', ') || '—'}`,
        ]
          .filter((line) => line !== '')
          .join('\n')
      : [
          `## ${name}`,
          `**日期** ${fortune.date} · **走势** ${tendency}`,
          '',
          `### 总评 · ${fortune.overall.score}（${overallLvl}）`,
          fortune.overall.blurb || '',
          fortune.hexagram.summary ? `\n> ${fortune.hexagram.summary}` : '',
          fortune.hexagram.advice ? `\n**建议：** ${fortune.hexagram.advice}` : '',
          aspectLines.length ? `\n### 分项运势\n\n${aspectLines.join('\n')}` : '',
          `\n### 今日吉意`,
          `- **颜色：** ${fortune.lucky.colors.join('、') || '—'}`,
          `- **数字：** ${fortune.lucky.numbers.join('、') || '—'}`,
          `- **方位：** ${fortune.lucky.directions.join('、') || '—'}`,
        ]
          .filter((line) => line !== '')
          .join('\n')
    return { ok: true, summary, detail, detailFormat: 'markdown' }
  }

  const aspectHtml = aspectEntries
    .map(([key, a]) => {
      const label = aspectName(String(key), locale)
      const lvl = levelLabel(a.level, locale)
      const blurb = a.blurb?.trim() ? `<div class="muted">${escapeHtml(a.blurb.trim())}</div>` : ''
      return `<div class="row"><div><strong>${escapeHtml(label)}</strong>${blurb}</div><span class="score">${a.score} · ${escapeHtml(lvl)}</span></div>`
    })
    .join('')

  const body = isEn(locale)
    ? `
    <section class="hero">
      <h1>${escapeHtml(name)}</h1>
      <div class="meta">${escapeHtml(fortune.date)} · Trend ${escapeHtml(tendency)}</div>
      <p class="score" style="margin:.65rem 0 0">Overall ${fortune.overall.score} · ${escapeHtml(overallLvl)}</p>
      ${fortune.overall.blurb ? `<p style="margin:.45rem 0 0">${escapeHtml(fortune.overall.blurb)}</p>` : ''}
    </section>
    ${fortune.hexagram.summary ? `<section class="card"><h2>Summary</h2><div class="quote">${escapeHtml(fortune.hexagram.summary)}</div></section>` : ''}
    ${fortune.hexagram.advice ? `<section class="card"><h2>Advice</h2><p>${escapeHtml(fortune.hexagram.advice)}</p></section>` : ''}
    <section class="card"><h2>Aspects</h2><div class="grid">${aspectHtml}</div></section>
    <section class="card"><h2>Lucky cues</h2>
      <ul>
        <li><strong>Colors:</strong> ${escapeHtml(fortune.lucky.colors.join(', ') || '—')}</li>
        <li><strong>Numbers:</strong> ${escapeHtml(fortune.lucky.numbers.join(', ') || '—')}</li>
        <li><strong>Directions:</strong> ${escapeHtml(fortune.lucky.directions.join(', ') || '—')}</li>
      </ul>
    </section>`
    : `
    <section class="hero">
      <h1>${escapeHtml(name)}</h1>
      <div class="meta">${escapeHtml(fortune.date)} · 走势 ${escapeHtml(tendency)}</div>
      <p class="score" style="margin:.65rem 0 0">总评 ${fortune.overall.score} · ${escapeHtml(overallLvl)}</p>
      ${fortune.overall.blurb ? `<p style="margin:.45rem 0 0">${escapeHtml(fortune.overall.blurb)}</p>` : ''}
    </section>
    ${fortune.hexagram.summary ? `<section class="card"><h2>卦辞摘要</h2><div class="quote">${escapeHtml(fortune.hexagram.summary)}</div></section>` : ''}
    ${fortune.hexagram.advice ? `<section class="card"><h2>建议</h2><p>${escapeHtml(fortune.hexagram.advice)}</p></section>` : ''}
    <section class="card"><h2>分项运势</h2><div class="grid">${aspectHtml}</div></section>
    <section class="card"><h2>今日吉意</h2>
      <ul>
        <li><strong>颜色：</strong>${escapeHtml(fortune.lucky.colors.join('、') || '—')}</li>
        <li><strong>数字：</strong>${escapeHtml(fortune.lucky.numbers.join('、') || '—')}</li>
        <li><strong>方位：</strong>${escapeHtml(fortune.lucky.directions.join('、') || '—')}</li>
      </ul>
    </section>`

  return {
    ok: true,
    summary,
    detail: reportShell(name, body, locale),
    detailFormat: 'html',
  }
}

export function checkFortuneNotification(opts?: {
  desktopNotify?: boolean
  force?: boolean
}): FortuneNotifyResult {
  const desktopNotify = opts?.desktopNotify !== false
  const { fortuneDaily, fortuneNotifyHour } = settingsStore.getNotifications()
  if (!fortuneDaily && !opts?.force) return { sent: false, skipped: 'disabled' }
  if (!fortuneStore.getProfile()) return { sent: false, skipped: 'no_profile' }

  const today = todayYmd()
  const last = getSetting<string>('notifications.lastFortuneDate', '')
  if (last === today && !opts?.force) return { sent: false, skipped: 'already_today' }

  const hour = new Date().getHours()
  if (!opts?.force && hour < fortuneNotifyHour) return { sent: false, skipped: 'before_hour' }

  const locale = settingsStore.getLocale()
  const copy = buildFortuneInboxCopy(locale)
  const { title, body } = notifyCopy(locale)

  if (desktopNotify && Notification.isSupported()) {
    try {
      new Notification({ title, body: copy.summary || body }).show()
    } catch (err) {
      logger.warn('fortune notification failed', err)
    }
  }

  setSetting('notifications.lastFortuneDate', today)
  logger.info('fortune daily notification marked')
  return {
    sent: true,
    summary: copy.summary || body,
    detail: copy.detail || body,
  }
}

let timer: ReturnType<typeof setInterval> | null = null

export function startFortuneNotificationScheduler(): void {
  checkFortuneNotification()
  if (timer) clearInterval(timer)
  timer = setInterval(() => checkFortuneNotification(), 60_000)
}

export function stopFortuneNotificationScheduler(): void {
  if (timer) clearInterval(timer)
  timer = null
}

/** Clear last-notified date so the next check can fire again (e.g. after midnight). */
export function resetFortuneNotificationIfNewDay(): void {
  const today = todayYmd()
  const last = getSetting<string>('notifications.lastFortuneDate', '')
  if (last && last !== today) {
    setSetting('notifications.lastFortuneDate', '')
  }
}

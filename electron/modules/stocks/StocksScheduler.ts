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

function notifyCopy(locale: string, count: number): { title: string; body: string } {
  if (locale.startsWith('en')) {
    return {
      title: 'Daily stock report ready',
      body: `${count} pick(s) generated. Open Treasure Chest to review.`,
    }
  }
  return {
    title: '今日荐股报告已生成',
    body: `共 ${count} 条推荐，打开百宝箱查看详情。`,
  }
}

let running = false
let timer: ReturnType<typeof setInterval> | null = null

export async function checkStocksAutoGenerate(): Promise<void> {
  const cfg = settingsStore.getStocksSettings()
  if (!cfg.autoGenerate) return

  const today = todayYmd()
  const last = getSetting<string>('stocks.lastAutoReportDate', '')
  if (last === today) return

  const hour = new Date().getHours()
  if (hour < cfg.autoGenerateHour) return

  const { open, closed } = getEnabledOpenMarkets({
    CN: cfg.marketCN,
    US: cfg.marketUS,
  }, today)

  if (open.length === 0) {
    // All enabled markets closed — mark day done so we don't keep retrying.
    setSetting('stocks.lastAutoReportDate', today)
    logger.info(
      `stocks auto-generate skipped (all markets closed): ${closed.map((c) => `${c.market}:${c.reason}`).join(', ')}`,
    )
    return
  }

  if (running) return

  running = true
  try {
    logger.info(`stocks auto-generate started (open=${open.join(',')})`)
    const report = await generateStocksReportFromWatchlist()
    setSetting('stocks.lastAutoReportDate', today)
    logger.info(`stocks auto-generate done count=${report.recommendations.length}`)

    const { stocksDaily } = settingsStore.getNotifications()
    if (stocksDaily && Notification.isSupported() && report.recommendations.length > 0) {
      const { title, body } = notifyCopy(settingsStore.getLocale(), report.recommendations.length)
      new Notification({ title, body }).show()
      setSetting('notifications.lastStocksReportDate', today)
    }
  } catch (err) {
    logger.warn('stocks auto-generate failed', err)
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

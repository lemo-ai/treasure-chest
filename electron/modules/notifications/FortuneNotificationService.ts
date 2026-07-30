import { Notification } from 'electron'
import { getSetting, setSetting } from '../../db/AppSettingsRepo'
import { fortuneStore } from '../fortune/FortuneStore'
import { settingsStore } from '../settings/SettingsStore'
import { logger } from '../../utils/logger'

function todayYmd(): string {
  const n = new Date()
  const pad = (v: number) => String(v).padStart(2, '0')
  return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`
}

function notifyCopy(locale: string): { title: string; body: string } {
  if (locale.startsWith('en')) {
    return {
      title: 'Daily fortune updated',
      body: 'Open Treasure Chest to read today’s hexagram and scores.',
    }
  }
  return {
    title: '今日运势已更新',
    body: '打开百宝箱查看今日卦象与分项运势。',
  }
}

export function checkFortuneNotification(): void {
  const { fortuneDaily, fortuneNotifyHour } = settingsStore.getNotifications()
  if (!fortuneDaily) return
  if (!fortuneStore.getProfile()) return
  if (!Notification.isSupported()) return

  const today = todayYmd()
  const last = getSetting<string>('notifications.lastFortuneDate', '')
  if (last === today) return

  const hour = new Date().getHours()
  if (hour < fortuneNotifyHour) return

  const { title, body } = notifyCopy(settingsStore.getLocale())
  try {
    new Notification({ title, body }).show()
    setSetting('notifications.lastFortuneDate', today)
    logger.info('fortune daily notification sent')
  } catch (err) {
    logger.warn('fortune notification failed', err)
  }
}

let timer: ReturnType<typeof setInterval> | null = null

export function startFortuneNotificationScheduler(): void {
  checkFortuneNotification()
  if (timer) clearInterval(timer)
  timer = setInterval(checkFortuneNotification, 60_000)
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

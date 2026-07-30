import { app } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type {
  AppLocale,
  AppSettingsSnapshot,
  CalendarMode,
  DesktopWidgetSettings,
  DesktopWidgetView,
  DialFaceStyle,
  LaunchBehavior,
  NotificationSettings,
  ThemeMode,
  FortuneSettings,
  HexagramSchool,
} from '@shared'
import {
  DEFAULT_DESKTOP_WIDGET,
  DEFAULT_FORTUNE_SETTINGS,
  DEFAULT_LAUNCH_AT_LOGIN,
  DEFAULT_LAUNCH_BEHAVIOR,
  DEFAULT_NOTIFICATION_SETTINGS,
  DIAL_FACE_STYLES,
  HEXAGRAM_SCHOOLS,
} from '@shared'
import { getSetting, setSetting } from '../../db/AppSettingsRepo'
import { resolveDialBackgroundUrl } from './DialBackground'
import { logger } from '../../utils/logger'

interface PersistedSettings {
  theme: ThemeMode
  locale: AppLocale
  calendarMode: CalendarMode
  desktopWidget: DesktopWidgetSettings
  launchAtLogin: boolean
  launchBehavior: LaunchBehavior
  notifications: NotificationSettings
  fortune: FortuneSettings
}

const memory: PersistedSettings = {
  theme: 'system',
  locale: 'zh-CN',
  calendarMode: 'widget',
  desktopWidget: { ...DEFAULT_DESKTOP_WIDGET },
  launchAtLogin: DEFAULT_LAUNCH_AT_LOGIN,
  launchBehavior: DEFAULT_LAUNCH_BEHAVIOR,
  notifications: { ...DEFAULT_NOTIFICATION_SETTINGS },
  fortune: { ...DEFAULT_FORTUNE_SETTINGS },
}

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

function parseDialFace(value: unknown): DialFaceStyle {
  if (typeof value === 'string' && (DIAL_FACE_STYLES as string[]).includes(value)) {
    return value as DialFaceStyle
  }
  return DEFAULT_DESKTOP_WIDGET.dialFace
}

function parseLaunchBehavior(value: unknown): LaunchBehavior {
  if (value === 'main' || value === 'tray' || value === 'widget') return value
  return DEFAULT_LAUNCH_BEHAVIOR
}

function parseHexagramSchool(value: unknown): HexagramSchool {
  if (typeof value === 'string' && (HEXAGRAM_SCHOOLS as string[]).includes(value)) {
    return value as HexagramSchool
  }
  return DEFAULT_FORTUNE_SETTINGS.hexagramSchool
}

function parseFortuneSettings(raw: unknown): FortuneSettings {
  const src = (raw ?? {}) as Partial<FortuneSettings>
  return {
    hexagramSchool: parseHexagramSchool(src.hexagramSchool),
    aiPolish: Boolean(src.aiPolish),
  }
}

function parseDesktopWidget(raw: unknown): DesktopWidgetSettings {
  const src = (raw ?? {}) as Partial<DesktopWidgetSettings>
  const bg = typeof src.backgroundImagePath === 'string' ? src.backgroundImagePath : null
  return {
    enabled: Boolean(src.enabled),
    keepAlive: src.keepAlive === undefined ? DEFAULT_DESKTOP_WIDGET.keepAlive : Boolean(src.keepAlive),
    dialFace: parseDialFace(src.dialFace),
    backgroundImagePath: bg && existsSync(bg) ? bg : null,
    showTicks: src.showTicks === undefined ? DEFAULT_DESKTOP_WIDGET.showTicks : Boolean(src.showTicks),
  }
}

function loadFromDb(): void {
  memory.theme = getSetting('ui.theme', memory.theme)
  memory.locale = getSetting('ui.locale', memory.locale)
  memory.calendarMode = getSetting('calendar.mode', memory.calendarMode)
  memory.launchAtLogin = getSetting('system.launchAtLogin', memory.launchAtLogin)
  memory.launchBehavior = parseLaunchBehavior(getSetting('system.launchBehavior', memory.launchBehavior))
  memory.desktopWidget = parseDesktopWidget(getSetting('desktop.widget', memory.desktopWidget))
  memory.notifications = {
    ...DEFAULT_NOTIFICATION_SETTINGS,
    ...getSetting('notifications', DEFAULT_NOTIFICATION_SETTINGS),
  }
  memory.fortune = parseFortuneSettings(getSetting('fortune', DEFAULT_FORTUNE_SETTINGS))
}

/** Fallback for dev runs before DB init: legacy settings.json */
function loadLegacyJsonFallback(): void {
  try {
    const path = settingsPath()
    if (!existsSync(path)) return
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<PersistedSettings>
    if (raw.theme) memory.theme = raw.theme
    if (raw.locale) memory.locale = raw.locale
    if (raw.calendarMode) memory.calendarMode = raw.calendarMode
    if (raw.launchAtLogin !== undefined) memory.launchAtLogin = Boolean(raw.launchAtLogin)
    if (raw.launchBehavior) memory.launchBehavior = parseLaunchBehavior(raw.launchBehavior)
    if (raw.desktopWidget) memory.desktopWidget = parseDesktopWidget(raw.desktopWidget)
  } catch (err) {
    logger.warn('failed to load legacy settings.json', err)
  }
}

function persist(): void {
  setSetting('ui.theme', memory.theme)
  setSetting('ui.locale', memory.locale)
  setSetting('calendar.mode', memory.calendarMode)
  setSetting('system.launchAtLogin', memory.launchAtLogin)
  setSetting('system.launchBehavior', memory.launchBehavior)
  setSetting('desktop.widget', memory.desktopWidget)
  setSetting('notifications', memory.notifications)
  setSetting('fortune', memory.fortune)
}

export function initSettingsStore(): void {
  try {
    loadFromDb()
  } catch {
    loadLegacyJsonFallback()
  }
  logger.info(
    `settings loaded widget.enabled=${memory.desktopWidget.enabled} keepAlive=${memory.desktopWidget.keepAlive} dial=${memory.desktopWidget.dialFace}`,
  )
}

export const settingsStore = {
  getSnapshot(): AppSettingsSnapshot {
    return {
      theme: memory.theme,
      locale: memory.locale,
      calendarMode: memory.calendarMode,
      desktopWidget: { ...memory.desktopWidget },
      launchAtLogin: memory.launchAtLogin,
      launchBehavior: memory.launchBehavior,
      notifications: { ...memory.notifications },
      fortune: { ...memory.fortune },
    }
  },
  getTheme(): ThemeMode {
    return memory.theme
  },
  setTheme(theme: ThemeMode): ThemeMode {
    memory.theme = theme
    persist()
    return memory.theme
  },
  getLocale(): AppLocale {
    return memory.locale
  },
  setLocale(locale: AppLocale): AppLocale {
    memory.locale = locale
    persist()
    return memory.locale
  },
  getCalendarMode(): CalendarMode {
    return memory.calendarMode
  },
  setCalendarMode(mode: CalendarMode): CalendarMode {
    memory.calendarMode = mode
    persist()
    return memory.calendarMode
  },
  getDesktopWidget(): DesktopWidgetSettings {
    return { ...memory.desktopWidget }
  },
  getDesktopWidgetView(): DesktopWidgetView {
    const base = { ...memory.desktopWidget }
    return {
      ...base,
      backgroundImageUrl: resolveDialBackgroundUrl(base.backgroundImagePath),
    }
  },
  setDesktopWidget(partial: Partial<DesktopWidgetSettings>): DesktopWidgetSettings {
    memory.desktopWidget = {
      ...memory.desktopWidget,
      ...partial,
      dialFace: partial.dialFace
        ? parseDialFace(partial.dialFace)
        : memory.desktopWidget.dialFace,
      backgroundImagePath:
        partial.backgroundImagePath !== undefined
          ? partial.backgroundImagePath
          : memory.desktopWidget.backgroundImagePath,
      showTicks:
        partial.showTicks !== undefined
          ? Boolean(partial.showTicks)
          : memory.desktopWidget.showTicks,
    }
    persist()
    return { ...memory.desktopWidget }
  },
  getLaunchAtLogin(): boolean {
    return memory.launchAtLogin
  },
  setLaunchAtLogin(enabled: boolean): boolean {
    memory.launchAtLogin = enabled
    persist()
    return memory.launchAtLogin
  },
  getLaunchBehavior(): LaunchBehavior {
    return memory.launchBehavior
  },
  setLaunchBehavior(behavior: LaunchBehavior): LaunchBehavior {
    memory.launchBehavior = parseLaunchBehavior(behavior)
    persist()
    return memory.launchBehavior
  },
  getNotifications(): NotificationSettings {
    return { ...memory.notifications }
  },
  setNotifications(partial: Partial<NotificationSettings>): NotificationSettings {
    memory.notifications = { ...memory.notifications, ...partial }
    persist()
    return { ...memory.notifications }
  },
  getFortuneSettings(): FortuneSettings {
    return { ...memory.fortune }
  },
  setFortuneSettings(partial: Partial<FortuneSettings>): FortuneSettings {
    memory.fortune = {
      ...memory.fortune,
      ...partial,
      hexagramSchool: partial.hexagramSchool
        ? parseHexagramSchool(partial.hexagramSchool)
        : memory.fortune.hexagramSchool,
      aiPolish: partial.aiPolish !== undefined ? Boolean(partial.aiPolish) : memory.fortune.aiPolish,
    }
    persist()
    return { ...memory.fortune }
  },
  applySnapshot(snapshot: AppSettingsSnapshot): AppSettingsSnapshot {
    memory.theme = snapshot.theme
    memory.locale = snapshot.locale
    memory.calendarMode = snapshot.calendarMode
    memory.desktopWidget = parseDesktopWidget(snapshot.desktopWidget)
    memory.launchAtLogin = Boolean(snapshot.launchAtLogin)
    memory.launchBehavior = parseLaunchBehavior(snapshot.launchBehavior)
    memory.notifications = {
      ...DEFAULT_NOTIFICATION_SETTINGS,
      ...snapshot.notifications,
    }
    memory.fortune = parseFortuneSettings(snapshot.fortune ?? DEFAULT_FORTUNE_SETTINGS)
    persist()
    return settingsStore.getSnapshot()
  },
  /** Flat KV map for backup export. */
  exportSettingsMap(): Record<string, unknown> {
    return {
      'ui.theme': memory.theme,
      'ui.locale': memory.locale,
      'calendar.mode': memory.calendarMode,
      'system.launchAtLogin': memory.launchAtLogin,
      'system.launchBehavior': memory.launchBehavior,
      'desktop.widget': memory.desktopWidget,
      notifications: memory.notifications,
      fortune: memory.fortune,
    }
  },
  importSettingsMap(entries: Record<string, unknown>): void {
    if (entries['ui.theme']) memory.theme = entries['ui.theme'] as ThemeMode
    if (entries['ui.locale']) memory.locale = entries['ui.locale'] as AppLocale
    if (entries['calendar.mode']) memory.calendarMode = entries['calendar.mode'] as CalendarMode
    if (entries['system.launchAtLogin'] !== undefined) {
      memory.launchAtLogin = Boolean(entries['system.launchAtLogin'])
    }
    if (entries['system.launchBehavior']) {
      memory.launchBehavior = parseLaunchBehavior(entries['system.launchBehavior'])
    }
    if (entries['desktop.widget']) {
      memory.desktopWidget = parseDesktopWidget(entries['desktop.widget'])
    }
    if (entries.notifications) {
      memory.notifications = {
        ...DEFAULT_NOTIFICATION_SETTINGS,
        ...(entries.notifications as NotificationSettings),
      }
    }
    if (entries.fortune) {
      memory.fortune = parseFortuneSettings(entries.fortune)
    }
    persist()
  },
}

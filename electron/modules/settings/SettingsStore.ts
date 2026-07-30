import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type {
  AppLocale,
  AppSettingsSnapshot,
  CalendarMode,
  DesktopWidgetSettings,
  DesktopWidgetView,
  DialFaceStyle,
  ThemeMode,
} from '@shared'
import { DEFAULT_DESKTOP_WIDGET, DIAL_FACE_STYLES } from '@shared'
import { resolveDialBackgroundUrl } from './DialBackground'
import { logger } from '../../utils/logger'

interface PersistedSettings {
  theme: ThemeMode
  locale: AppLocale
  calendarMode: CalendarMode
  desktopWidget: DesktopWidgetSettings
}

const memory: PersistedSettings = {
  theme: 'system',
  locale: 'zh-CN',
  calendarMode: 'widget',
  desktopWidget: { ...DEFAULT_DESKTOP_WIDGET },
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

function load(): void {
  try {
    const path = settingsPath()
    if (!existsSync(path)) return
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<PersistedSettings>
    if (raw.theme) memory.theme = raw.theme
    if (raw.locale) memory.locale = raw.locale
    if (raw.calendarMode) memory.calendarMode = raw.calendarMode
    if (raw.desktopWidget) {
      const bg =
        typeof raw.desktopWidget.backgroundImagePath === 'string'
          ? raw.desktopWidget.backgroundImagePath
          : null
      memory.desktopWidget = {
        enabled: Boolean(raw.desktopWidget.enabled),
        keepAlive:
          raw.desktopWidget.keepAlive === undefined
            ? DEFAULT_DESKTOP_WIDGET.keepAlive
            : Boolean(raw.desktopWidget.keepAlive),
        dialFace: parseDialFace(raw.desktopWidget.dialFace),
        backgroundImagePath: bg && existsSync(bg) ? bg : null,
        showTicks:
          raw.desktopWidget.showTicks === undefined
            ? DEFAULT_DESKTOP_WIDGET.showTicks
            : Boolean(raw.desktopWidget.showTicks),
      }
    }
  } catch (err) {
    logger.warn('failed to load settings.json', err)
  }
}

function save(): void {
  try {
    const path = settingsPath()
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify(memory, null, 2), 'utf8')
  } catch (err) {
    logger.warn('failed to save settings.json', err)
  }
}

/** Load once after app ready; persist until M2 SQLite migration. */
export function initSettingsStore(): void {
  load()
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
    }
  },
  getTheme(): ThemeMode {
    return memory.theme
  },
  setTheme(theme: ThemeMode): ThemeMode {
    memory.theme = theme
    save()
    return memory.theme
  },
  getLocale(): AppLocale {
    return memory.locale
  },
  setLocale(locale: AppLocale): AppLocale {
    memory.locale = locale
    save()
    return memory.locale
  },
  getCalendarMode(): CalendarMode {
    return memory.calendarMode
  },
  setCalendarMode(mode: CalendarMode): CalendarMode {
    memory.calendarMode = mode
    save()
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
    save()
    return { ...memory.desktopWidget }
  },
}

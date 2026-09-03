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
  McpSettings,
  McpServerConfig,
  NotificationSettings,
  ThemeMode,
  ThemeAccent,
  FortuneSettings,
  FortuneAiProviderConfig,
  HexagramSchool,
  StocksSettings,
  StocksRangeKey,
} from '@shared'
import {
  DEFAULT_DESKTOP_WIDGET,
  DEFAULT_FORTUNE_SETTINGS,
  DEFAULT_LAUNCH_AT_LOGIN,
  DEFAULT_LAUNCH_BEHAVIOR,
  DEFAULT_MCP_SETTINGS,
  DEFAULT_NOTIFICATION_SETTINGS,
  DEFAULT_STOCKS_SETTINGS,
  DIAL_FACE_STYLES,
  DEFAULT_THEME_ACCENT,
  HEXAGRAM_SCHOOLS,
  THEME_ACCENTS,
  aiModelIds,
  hydrateLegacyMediaModels,
  mediaIdsFromModels,
  parseAiModelList,
} from '@shared'
import { getSetting, setSetting } from '../../db/AppSettingsRepo'
import { resolveDialBackgroundUrl } from './DialBackground'
import { logger } from '../../utils/logger'

interface PersistedSettings {
  theme: ThemeMode
  accent: ThemeAccent
  locale: AppLocale
  calendarMode: CalendarMode
  desktopWidget: DesktopWidgetSettings
  launchAtLogin: boolean
  launchBehavior: LaunchBehavior
  notifications: NotificationSettings
  fortune: FortuneSettings
  stocks: StocksSettings
  mcp: McpSettings
}

const memory: PersistedSettings = {
  theme: 'system',
  accent: DEFAULT_THEME_ACCENT,
  locale: 'zh-CN',
  calendarMode: 'widget',
  desktopWidget: { ...DEFAULT_DESKTOP_WIDGET },
  launchAtLogin: DEFAULT_LAUNCH_AT_LOGIN,
  launchBehavior: DEFAULT_LAUNCH_BEHAVIOR,
  notifications: { ...DEFAULT_NOTIFICATION_SETTINGS },
  fortune: { ...DEFAULT_FORTUNE_SETTINGS },
  stocks: { ...DEFAULT_STOCKS_SETTINGS },
  mcp: { servers: [...DEFAULT_MCP_SETTINGS.servers] },
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


function parseThemeAccent(value: unknown): ThemeAccent {
  if (typeof value === 'string' && (THEME_ACCENTS as string[]).includes(value)) {
    return value as ThemeAccent
  }
  return DEFAULT_THEME_ACCENT
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

function parseMcpSettings(raw: unknown): McpSettings {
  const src = (raw ?? {}) as Partial<McpSettings>
  const serversRaw = Array.isArray(src.servers) ? src.servers : []
  const servers: McpServerConfig[] = serversRaw
    .filter((s): s is McpServerConfig => Boolean(s && typeof s === 'object' && typeof (s as McpServerConfig).id === 'string'))
    .map((s) => {
      const transport = s.transport === 'sse' ? 'sse' : 'stdio'
      const env =
        s.env && typeof s.env === 'object'
          ? Object.fromEntries(Object.entries(s.env).map(([k, v]) => [k, String(v)]))
          : undefined
      const headers =
        s.headers && typeof s.headers === 'object'
          ? Object.fromEntries(Object.entries(s.headers).map(([k, v]) => [k, String(v)]))
          : undefined
      return {
        id: String(s.id).trim(),
        name: String(s.name || s.id).trim(),
        enabled: Boolean(s.enabled),
        transport,
        command: String(s.command || '').trim(),
        args: Array.isArray(s.args) ? s.args.map((a) => String(a)) : [],
        env: env && Object.keys(env).length > 0 ? env : undefined,
        url: typeof s.url === 'string' ? s.url.trim() : undefined,
        headers: headers && Object.keys(headers).length > 0 ? headers : undefined,
      } satisfies McpServerConfig
    })
    .filter((s) => {
      if (!s.id) return false
      if (s.transport === 'sse') return Boolean(s.url)
      return Boolean(s.command)
    })
  return { servers }
}

function parseStocksSettings(raw: unknown): StocksSettings {
  const src = (raw ?? {}) as Partial<StocksSettings>
  const allowed: StocksRangeKey[] = ['d1', 'w1', 'm1', 'm3', 'm6', 'ytd', 'y1']
  const ranges = Array.isArray(src.defaultRanges)
    ? src.defaultRanges.filter((k): k is StocksRangeKey => allowed.includes(k as StocksRangeKey))
    : DEFAULT_STOCKS_SETTINGS.defaultRanges
  const hour =
    typeof src.autoGenerateHour === 'number' && Number.isFinite(src.autoGenerateHour)
      ? Math.max(0, Math.min(23, Math.round(src.autoGenerateHour)))
      : DEFAULT_STOCKS_SETTINGS.autoGenerateHour
  const scannerMax =
    typeof src.scannerMax === 'number' && Number.isFinite(src.scannerMax)
      ? Math.max(1, Math.min(100, Math.round(src.scannerMax)))
      : DEFAULT_STOCKS_SETTINGS.scannerMax
  const maxRecommendations =
    typeof src.maxRecommendations === 'number' && Number.isFinite(src.maxRecommendations)
      ? Math.max(1, Math.min(50, Math.round(src.maxRecommendations)))
      : DEFAULT_STOCKS_SETTINGS.maxRecommendations
  return {
    marketCN: src.marketCN !== undefined ? Boolean(src.marketCN) : DEFAULT_STOCKS_SETTINGS.marketCN,
    marketUS: src.marketUS !== undefined ? Boolean(src.marketUS) : DEFAULT_STOCKS_SETTINGS.marketUS,
    autoGenerate: src.autoGenerate !== undefined ? Boolean(src.autoGenerate) : DEFAULT_STOCKS_SETTINGS.autoGenerate,
    autoGenerateHour: hour,
    scannerMax,
    maxRecommendations,
    defaultRanges: ranges.length > 0 ? ranges : [...DEFAULT_STOCKS_SETTINGS.defaultRanges],
  }
}

function parseFortuneSettings(raw: unknown): FortuneSettings {
  const src = (raw ?? {}) as Partial<FortuneSettings>
  const parsedModels = Array.isArray(src.aiModels)
    ? src.aiModels.filter((m): m is string => typeof m === 'string').map((m) => m.trim()).filter(Boolean)
    : []
  const fallbackModel = typeof src.aiModel === 'string' && src.aiModel.trim() ? src.aiModel.trim() : ''
  const modelList =
    parsedModels.length > 0
      ? Array.from(new Set(parsedModels))
      : fallbackModel
        ? [fallbackModel]
        : []
  const selectedModel = modelList.includes(fallbackModel) ? fallbackModel : (modelList[0] ?? '')
  const providersRaw = Array.isArray(src.aiProviders) ? src.aiProviders : []
  const parsedProviders: FortuneAiProviderConfig[] = providersRaw
    .map((item, idx) => {
      const r = item as Partial<FortuneAiProviderConfig>
      const id = typeof r.id === 'string' && r.id.trim() ? r.id.trim() : `provider-${idx + 1}`
      const name = typeof r.name === 'string' && r.name.trim() ? r.name.trim() : `Provider ${idx + 1}`
      const baseUrl =
        typeof r.baseUrl === 'string' && r.baseUrl.trim()
          ? r.baseUrl.trim()
          : DEFAULT_FORTUNE_SETTINGS.aiBaseUrl
      const apiFormat: 'openai' | 'anthropic' = r.apiFormat === 'anthropic' ? 'anthropic' : 'openai'
      const models = hydrateLegacyMediaModels(parseAiModelList(r.models), {
        imageModel: typeof r.imageModel === 'string' ? r.imageModel.trim() || undefined : undefined,
        videoModel: typeof r.videoModel === 'string' ? r.videoModel.trim() || undefined : undefined,
        musicModel: typeof r.musicModel === 'string' ? r.musicModel.trim() || undefined : undefined,
      })
      const apiKey = typeof r.apiKey === 'string' ? r.apiKey.trim() : ''
      const scrubbedModels =
        !apiKey && id === 'default-openai' && models.length === 1 && models[0]?.id === 'gpt-4o-mini'
          ? []
          : models
      const mediaProfileRaw = typeof r.mediaProfile === 'string' ? r.mediaProfile.trim() : 'auto'
      const mediaProfile = (
        [
          'auto',
          'openai_compat',
          'volcengine_ark',
          'dashscope',
          'kling',
          'minimax',
          'none',
        ] as const
      ).includes(mediaProfileRaw as 'auto')
        ? (mediaProfileRaw as FortuneAiProviderConfig['mediaProfile'])
        : 'auto'
      const derivedMedia = mediaIdsFromModels(scrubbedModels)
      const imageModel =
        (typeof r.imageModel === 'string' ? r.imageModel.trim() || undefined : undefined) ?? derivedMedia.imageModel
      const videoModel =
        (typeof r.videoModel === 'string' ? r.videoModel.trim() || undefined : undefined) ?? derivedMedia.videoModel
      const musicModel =
        (typeof r.musicModel === 'string' ? r.musicModel.trim() || undefined : undefined) ?? derivedMedia.musicModel
      return {
        id,
        name,
        baseUrl,
        apiFormat,
        models: scrubbedModels,
        apiKey,
        mediaProfile,
        imageModel,
        videoModel,
        musicModel,
      }
    })
    .filter((p) => Boolean(p.id))

  const fallbackProvider: FortuneAiProviderConfig = {
    id: 'provider-legacy',
    name:
      typeof src.aiProviderName === 'string' && src.aiProviderName.trim()
        ? src.aiProviderName.trim()
        : DEFAULT_FORTUNE_SETTINGS.aiProviderName,
    baseUrl:
      typeof src.aiBaseUrl === 'string' && src.aiBaseUrl.trim()
        ? src.aiBaseUrl.trim()
        : DEFAULT_FORTUNE_SETTINGS.aiBaseUrl,
    apiFormat:
      src.aiApiFormat === 'anthropic' || src.aiApiFormat === 'openai'
        ? src.aiApiFormat
        : DEFAULT_FORTUNE_SETTINGS.aiApiFormat,
    models: parseAiModelList(modelList),
    apiKey: typeof src.aiApiKey === 'string' ? src.aiApiKey.trim() : '',
    mediaProfile: 'auto',
  }

  const providers = parsedProviders.length > 0 ? parsedProviders : [fallbackProvider]
  const activeIdRaw = typeof src.aiActiveProviderId === 'string' ? src.aiActiveProviderId.trim() : ''
  const activeProvider = providers.find((p) => p.id === activeIdRaw) ?? providers[0]!
  const activeIds = aiModelIds(activeProvider.models)
  const activeModel = activeIds.includes(selectedModel) ? selectedModel : (activeIds[0] ?? '')

  return {
    hexagramSchool: parseHexagramSchool(src.hexagramSchool),
    aiPolish: Boolean(src.aiPolish),
    aiBaseUrl: activeProvider.baseUrl,
    aiProviderName: activeProvider.name,
    aiApiFormat: activeProvider.apiFormat,
    aiModels: activeIds,
    aiModel: activeModel,
    aiApiKey: activeProvider.apiKey,
    aiProviders: providers,
    aiActiveProviderId: activeProvider.id,
  }
}

function parseDesktopWidget(raw: unknown): DesktopWidgetSettings {
  const src = (raw ?? {}) as Partial<DesktopWidgetSettings>
  const bg = typeof src.backgroundImagePath === 'string' ? src.backgroundImagePath : null
  const active = bg && existsSync(bg) ? bg : null
  const historyRaw = Array.isArray(src.backgroundImageHistory) ? src.backgroundImageHistory : []
  const history = historyRaw.filter(
    (item): item is string => typeof item === 'string' && item.length > 0 && existsSync(item),
  )
  if (active && !history.includes(active)) {
    history.unshift(active)
  }
  return {
    enabled: Boolean(src.enabled),
    keepAlive: src.keepAlive === undefined ? DEFAULT_DESKTOP_WIDGET.keepAlive : Boolean(src.keepAlive),
    dialFace: parseDialFace(src.dialFace),
    backgroundImagePath: active,
    backgroundImageHistory: history,
    showTicks: src.showTicks === undefined ? DEFAULT_DESKTOP_WIDGET.showTicks : Boolean(src.showTicks),
  }
}

function loadFromDb(): void {
  memory.theme = getSetting('ui.theme', memory.theme)
  memory.accent = parseThemeAccent(getSetting('ui.accent', memory.accent))
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
  memory.stocks = parseStocksSettings(getSetting('stocks', DEFAULT_STOCKS_SETTINGS))
  memory.mcp = parseMcpSettings(getSetting('mcp', DEFAULT_MCP_SETTINGS))
}

/** Fallback for dev runs before DB init: legacy settings.json */
function loadLegacyJsonFallback(): void {
  try {
    const path = settingsPath()
    if (!existsSync(path)) return
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<PersistedSettings>
    if (raw.theme) memory.theme = raw.theme
    if (raw.accent) memory.accent = parseThemeAccent(raw.accent)
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
  setSetting('ui.accent', memory.accent)
  setSetting('ui.locale', memory.locale)
  setSetting('calendar.mode', memory.calendarMode)
  setSetting('system.launchAtLogin', memory.launchAtLogin)
  setSetting('system.launchBehavior', memory.launchBehavior)
  setSetting('desktop.widget', memory.desktopWidget)
  setSetting('notifications', memory.notifications)
  setSetting('fortune', memory.fortune)
  setSetting('stocks', memory.stocks)
  setSetting('mcp', memory.mcp)
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
      accent: memory.accent,
      locale: memory.locale,
      calendarMode: memory.calendarMode,
      desktopWidget: { ...memory.desktopWidget },
      launchAtLogin: memory.launchAtLogin,
      launchBehavior: memory.launchBehavior,
      notifications: { ...memory.notifications },
      fortune: { ...memory.fortune },
      stocks: { ...memory.stocks },
      mcp: {
        servers: memory.mcp.servers.map((s) => ({
          ...s,
          args: [...s.args],
          env: s.env ? { ...s.env } : undefined,
          headers: s.headers ? { ...s.headers } : undefined,
        })),
      },
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
  getAccent(): ThemeAccent {
    return memory.accent
  },
  setAccent(accent: ThemeAccent): ThemeAccent {
    memory.accent = parseThemeAccent(accent)
    persist()
    return memory.accent
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
    const backgroundHistory = base.backgroundImageHistory
      .map((path) => {
        const url = resolveDialBackgroundUrl(path)
        return url ? { path, url } : null
      })
      .filter((item): item is { path: string; url: string } => Boolean(item))
    return {
      ...base,
      backgroundImageUrl: resolveDialBackgroundUrl(base.backgroundImagePath),
      backgroundHistory,
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
      backgroundImageHistory:
        partial.backgroundImageHistory !== undefined
          ? partial.backgroundImageHistory.filter(
              (item): item is string => typeof item === 'string' && item.length > 0,
            )
          : memory.desktopWidget.backgroundImageHistory,
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
    const nextModelsRaw = partial.aiModels !== undefined ? partial.aiModels : memory.fortune.aiModels
    const nextModels = Array.from(
      new Set(
        (Array.isArray(nextModelsRaw) ? nextModelsRaw : [])
          .filter((m): m is string => typeof m === 'string')
          .map((m) => m.trim())
          .filter(Boolean),
      ),
    )
    const fallbackModel =
      partial.aiModel !== undefined ? partial.aiModel.trim() : memory.fortune.aiModel
    const normalizedModels =
      nextModels.length > 0 ? nextModels : fallbackModel ? [fallbackModel] : []
    const nextSelectedModel = normalizedModels.includes(fallbackModel)
      ? fallbackModel
      : (normalizedModels[0] ?? '')

    const nextProvidersRaw = partial.aiProviders !== undefined ? partial.aiProviders : memory.fortune.aiProviders
    const nextProviders: FortuneAiProviderConfig[] = (Array.isArray(nextProvidersRaw) ? nextProvidersRaw : [])
      .map((p, idx) => {
        const id = typeof p.id === 'string' && p.id.trim() ? p.id.trim() : `provider-${idx + 1}`
        const name = typeof p.name === 'string' && p.name.trim() ? p.name.trim() : `Provider ${idx + 1}`
        const baseUrl = typeof p.baseUrl === 'string' && p.baseUrl.trim()
          ? p.baseUrl.trim()
          : DEFAULT_FORTUNE_SETTINGS.aiBaseUrl
        const apiFormat: 'openai' | 'anthropic' = p.apiFormat === 'anthropic' ? 'anthropic' : 'openai'
        const models = hydrateLegacyMediaModels(parseAiModelList(p.models), {
          imageModel: typeof p.imageModel === 'string' ? p.imageModel.trim() || undefined : undefined,
          videoModel: typeof p.videoModel === 'string' ? p.videoModel.trim() || undefined : undefined,
          musicModel: typeof p.musicModel === 'string' ? p.musicModel.trim() || undefined : undefined,
        })
        const apiKey = typeof p.apiKey === 'string' ? p.apiKey.trim() : ''
        const mediaProfile =
          p.mediaProfile === 'openai_compat' ||
          p.mediaProfile === 'volcengine_ark' ||
          p.mediaProfile === 'dashscope' ||
          p.mediaProfile === 'kling' ||
          p.mediaProfile === 'minimax' ||
          p.mediaProfile === 'none' ||
          p.mediaProfile === 'auto'
            ? p.mediaProfile
            : 'auto'
        const derivedMedia = mediaIdsFromModels(models)
        return {
          id,
          name,
          baseUrl,
          apiFormat,
          models,
          apiKey,
          mediaProfile,
          imageModel:
            (typeof p.imageModel === 'string' ? p.imageModel.trim() || undefined : undefined) ?? derivedMedia.imageModel,
          videoModel:
            (typeof p.videoModel === 'string' ? p.videoModel.trim() || undefined : undefined) ?? derivedMedia.videoModel,
          musicModel:
            (typeof p.musicModel === 'string' ? p.musicModel.trim() || undefined : undefined) ?? derivedMedia.musicModel,
        }
      })
      .filter((p) => Boolean(p.id))
    const safeProviders = nextProviders.length > 0 ? nextProviders : memory.fortune.aiProviders
    const activeId = partial.aiActiveProviderId !== undefined ? partial.aiActiveProviderId.trim() : memory.fortune.aiActiveProviderId
    const activeProvider = safeProviders.find((p) => p.id === activeId) ?? safeProviders[0]!

    const activeIds = aiModelIds(activeProvider.models)
    const selectedOnProvider = activeIds.includes(nextSelectedModel)
      ? nextSelectedModel
      : (activeIds[0] ?? '')

    memory.fortune = {
      ...memory.fortune,
      ...partial,
      hexagramSchool: partial.hexagramSchool
        ? parseHexagramSchool(partial.hexagramSchool)
        : memory.fortune.hexagramSchool,
      aiPolish: partial.aiPolish !== undefined ? Boolean(partial.aiPolish) : memory.fortune.aiPolish,
      aiBaseUrl: activeProvider.baseUrl,
      aiProviderName: activeProvider.name,
      aiApiFormat: activeProvider.apiFormat,
      aiModels: activeIds.length > 0 ? activeIds : normalizedModels,
      aiModel: selectedOnProvider,
      aiApiKey: activeProvider.apiKey,
      aiProviders: safeProviders,
      aiActiveProviderId: activeProvider.id,
    }
    persist()
    return { ...memory.fortune }
  },
  getStocksSettings(): StocksSettings {
    return { ...memory.stocks }
  },
  setStocksSettings(partial: Partial<StocksSettings>): StocksSettings {
    memory.stocks = parseStocksSettings({ ...memory.stocks, ...partial })
    persist()
    return { ...memory.stocks }
  },
  getMcpSettings(): McpSettings {
    return {
      servers: memory.mcp.servers.map((s) => ({
        ...s,
        args: [...s.args],
        env: s.env ? { ...s.env } : undefined,
        headers: s.headers ? { ...s.headers } : undefined,
      })),
    }
  },
  setMcpSettings(next: McpSettings): McpSettings {
    memory.mcp = parseMcpSettings(next)
    persist()
    return settingsStore.getMcpSettings()
  },
  applySnapshot(snapshot: AppSettingsSnapshot): AppSettingsSnapshot {
    memory.theme = snapshot.theme
    memory.accent = parseThemeAccent(snapshot.accent)
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
    memory.stocks = parseStocksSettings(snapshot.stocks ?? DEFAULT_STOCKS_SETTINGS)
    memory.mcp = parseMcpSettings(snapshot.mcp ?? DEFAULT_MCP_SETTINGS)
    persist()
    return settingsStore.getSnapshot()
  },
  /** Flat KV map for backup export. */
  exportSettingsMap(): Record<string, unknown> {
    return {
      'ui.theme': memory.theme,
      'ui.accent': memory.accent,
      'ui.locale': memory.locale,
      'calendar.mode': memory.calendarMode,
      'system.launchAtLogin': memory.launchAtLogin,
      'system.launchBehavior': memory.launchBehavior,
      'desktop.widget': memory.desktopWidget,
      notifications: memory.notifications,
      fortune: memory.fortune,
      stocks: memory.stocks,
      mcp: memory.mcp,
    }
  },
  importSettingsMap(entries: Record<string, unknown>): void {
    if (entries['ui.theme']) memory.theme = entries['ui.theme'] as ThemeMode
    if (entries['ui.accent']) memory.accent = parseThemeAccent(entries['ui.accent'])
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
    if (entries.stocks) {
      memory.stocks = parseStocksSettings(entries.stocks)
    }
    if (entries.mcp) {
      memory.mcp = parseMcpSettings(entries.mcp)
    }
    persist()
  },
}

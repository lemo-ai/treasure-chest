import { app, BrowserWindow } from 'electron'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type {
  AppLocale,
  AppSettingsSnapshot,
  CalendarMode,
  DataSourcesSettings,
  DataSourceConfig,
  DesktopWidgetSettings,
  DesktopWidgetView,
  DialFaceStyle,
  LaunchBehavior,
  McpSettings,
  McpServerConfig,
  NotificationChannels,
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
  BUILTIN_MCP_SERVERS,
  DEFAULT_DATA_SOURCES_SETTINGS,
  DEFAULT_DESKTOP_WIDGET,
  DEFAULT_FORTUNE_SETTINGS,
  DEFAULT_LAUNCH_AT_LOGIN,
  DEFAULT_LAUNCH_BEHAVIOR,
  DEFAULT_MCP_SETTINGS,
  DEFAULT_NOTIFICATION_CHANNELS,
  DEFAULT_NOTIFICATION_SETTINGS,
  DEFAULT_STOCKS_SETTINGS,
  DIAL_FACE_STYLES,
  DEFAULT_THEME_ACCENT,
  HEXAGRAM_SCHOOLS,
  IpcChannels,
  MCP_WORKSPACE_PATH_TOKEN,
  THEME_ACCENTS,
  aiModelIds,
  firstChatModelId,
  hydrateLegacyMediaModels,
  isChatAiModel,
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
  dataSources: DataSourcesSettings
}

function cloneChannels(channels?: Partial<NotificationChannels> | null): NotificationChannels {
  const base = DEFAULT_NOTIFICATION_CHANNELS
  const src = channels ?? {}
  return {
    workbenchInbox: src.workbenchInbox ?? base.workbenchInbox,
    desktopOs: src.desktopOs ?? base.desktopOs,
    dingtalk: {
      ...base.dingtalk,
      ...(src.dingtalk ?? {}),
      webhookUrl: String(src.dingtalk?.webhookUrl ?? base.dingtalk.webhookUrl),
      secret: String(src.dingtalk?.secret ?? base.dingtalk.secret),
      enabled: Boolean(src.dingtalk?.enabled ?? base.dingtalk.enabled),
    },
    email: {
      ...base.email,
      ...(src.email ?? {}),
      to: String(src.email?.to ?? base.email.to),
      smtpHost: String(src.email?.smtpHost ?? base.email.smtpHost),
      smtpPort: Number(src.email?.smtpPort ?? base.email.smtpPort) || 465,
      secure: Boolean(src.email?.secure ?? base.email.secure),
      user: String(src.email?.user ?? base.email.user),
      pass: String(src.email?.pass ?? base.email.pass),
      from: String(src.email?.from ?? base.email.from),
      enabled: Boolean(src.email?.enabled ?? base.email.enabled),
    },
  }
}

function parseNotifications(raw: unknown): NotificationSettings {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Partial<NotificationSettings>
  return {
    fortuneDaily: Boolean(src.fortuneDaily ?? DEFAULT_NOTIFICATION_SETTINGS.fortuneDaily),
    fortuneNotifyHour: Number.isFinite(src.fortuneNotifyHour)
      ? Math.min(23, Math.max(0, Math.floor(Number(src.fortuneNotifyHour))))
      : DEFAULT_NOTIFICATION_SETTINGS.fortuneNotifyHour,
    stocksDaily: Boolean(src.stocksDaily ?? DEFAULT_NOTIFICATION_SETTINGS.stocksDaily),
    channels: cloneChannels(src.channels),
  }
}

function parseDataSources(raw: unknown): DataSourcesSettings {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Partial<DataSourcesSettings>
  const list = Array.isArray(src.sources) ? src.sources : []
  const allowed = new Set([
    'http_json',
    'http_text',
    'local_file',
    'static_text',
    'sqlite',
    'duckdb',
    'postgres',
    'mysql',
    'mariadb',
    'mssql',
    'oracle',
    'mongodb',
    'redis',
    'clickhouse',
    'cassandra',
    'elasticsearch',
    'influxdb',
    'dynamodb',
    'snowflake',
    'cockroach',
    'tidb',
    'redshift',
    'trino',
    'qdrant',
    'chroma',
  ])
  const sources: DataSourceConfig[] = list
    .filter((s): s is DataSourceConfig => Boolean(s && typeof s === 'object' && typeof (s as DataSourceConfig).id === 'string'))
    .map((s) => ({
      id: String(s.id),
      name: String(s.name || s.id).slice(0, 80),
      enabled: s.enabled !== false,
      kind: allowed.has(String(s.kind)) ? (s.kind as DataSourceConfig['kind']) : 'static_text',
      icon: typeof s.icon === 'string' ? s.icon.slice(0, 500_000) : undefined,
      url: typeof s.url === 'string' ? s.url : undefined,
      headers: s.headers && typeof s.headers === 'object' ? { ...s.headers } : undefined,
      jsonPath: typeof s.jsonPath === 'string' ? s.jsonPath : undefined,
      path: typeof s.path === 'string' ? s.path : undefined,
      content: typeof s.content === 'string' ? s.content.slice(0, 50_000) : undefined,
      host: typeof s.host === 'string' ? s.host : undefined,
      port: typeof s.port === 'number' && Number.isFinite(s.port) ? Math.floor(s.port) : undefined,
      database: typeof s.database === 'string' ? s.database : undefined,
      username: typeof s.username === 'string' ? s.username : undefined,
      password: typeof s.password === 'string' ? s.password : undefined,
      ssl: typeof s.ssl === 'boolean' ? s.ssl : undefined,
      sql: typeof s.sql === 'string' ? s.sql.slice(0, 20_000) : undefined,
      collection: typeof s.collection === 'string' ? s.collection : undefined,
      query: typeof s.query === 'string' ? s.query.slice(0, 20_000) : undefined,
      topK: typeof s.topK === 'number' && Number.isFinite(s.topK) ? Math.floor(s.topK) : undefined,
      driverVersion: typeof s.driverVersion === 'string' ? s.driverVersion.slice(0, 40) : undefined,
      updatedAt: typeof s.updatedAt === 'string' ? s.updatedAt : new Date().toISOString(),
    }))
  return { sources }
}

const memory: PersistedSettings = {
  theme: 'system',
  accent: DEFAULT_THEME_ACCENT,
  locale: 'zh-CN',
  calendarMode: 'widget',
  desktopWidget: { ...DEFAULT_DESKTOP_WIDGET },
  launchAtLogin: DEFAULT_LAUNCH_AT_LOGIN,
  launchBehavior: DEFAULT_LAUNCH_BEHAVIOR,
  notifications: parseNotifications(DEFAULT_NOTIFICATION_SETTINGS),
  fortune: { ...DEFAULT_FORTUNE_SETTINGS },
  stocks: { ...DEFAULT_STOCKS_SETTINGS },
  mcp: { servers: [...DEFAULT_MCP_SETTINGS.servers] },
  dataSources: { sources: [] },
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
    .map((s): McpServerConfig => {
      const transport: McpServerConfig['transport'] = s.transport === 'sse' ? 'sse' : 'stdio'
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
      }
    })
    .filter((s) => {
      if (!s.id) return false
      if (s.transport === 'sse') return Boolean(s.url)
      return Boolean(s.command)
    })
  return { servers }
}

const MCP_BUILTINS_SEEDED_KEY = 'mcp.builtinsSeeded.v1'

function resolveMcpWorkspaceDir(): string {
  const dir = join(app.getPath('userData'), 'mcp-workspace')
  try {
    mkdirSync(dir, { recursive: true })
  } catch (err) {
    logger.warn('mcp workspace mkdir failed', err)
  }
  return dir
}

function materializeBuiltinMcpServers(): McpServerConfig[] {
  const workspace = resolveMcpWorkspaceDir()
  return BUILTIN_MCP_SERVERS.map((s) => ({
    ...s,
    args: s.args.map((a) => (a === MCP_WORKSPACE_PATH_TOKEN ? workspace : a)),
    env: s.env ? { ...s.env } : undefined,
    headers: s.headers ? { ...s.headers } : undefined,
  }))
}

/** Replace path tokens and seed official open-source MCPs when the list is still empty. */
function finalizeMcpSettingsAfterLoad(): void {
  const workspace = resolveMcpWorkspaceDir()
  let changed = false
  const servers = memory.mcp.servers.map((s) => {
    let argsChanged = false
    const nextArgs = (s.args ?? []).map((a) => {
      if (a === MCP_WORKSPACE_PATH_TOKEN) {
        argsChanged = true
        changed = true
        return workspace
      }
      return a
    })
    return argsChanged ? { ...s, args: nextArgs } : s
  })
  if (changed) memory.mcp = { servers }

  const seeded = Boolean(getSetting(MCP_BUILTINS_SEEDED_KEY, false))
  if (!seeded) {
    if (memory.mcp.servers.length === 0) {
      memory.mcp = { servers: materializeBuiltinMcpServers() }
      changed = true
      logger.info(`seeded ${memory.mcp.servers.length} builtin MCP servers`)
    }
    setSetting(MCP_BUILTINS_SEEDED_KEY, true)
  }

  if (changed) setSetting('mcp', memory.mcp)
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
  memory.notifications = parseNotifications(getSetting('notifications', DEFAULT_NOTIFICATION_SETTINGS))
  memory.fortune = parseFortuneSettings(getSetting('fortune', DEFAULT_FORTUNE_SETTINGS))
  memory.stocks = parseStocksSettings(getSetting('stocks', DEFAULT_STOCKS_SETTINGS))
  memory.mcp = parseMcpSettings(getSetting('mcp', DEFAULT_MCP_SETTINGS))
  memory.dataSources = parseDataSources(getSetting('dataSources', DEFAULT_DATA_SOURCES_SETTINGS))
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
  setSetting('dataSources', memory.dataSources)
}

export function initSettingsStore(): void {
  try {
    loadFromDb()
  } catch {
    loadLegacyJsonFallback()
  }
  finalizeMcpSettingsAfterLoad()
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
      notifications: parseNotifications(memory.notifications),
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
      dataSources: {
        sources: memory.dataSources.sources.map((s) => ({
          ...s,
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
    return parseNotifications(memory.notifications)
  },
  setNotifications(partial: Partial<NotificationSettings>): NotificationSettings {
    const prev = parseNotifications(memory.notifications)
    memory.notifications = parseNotifications({
      ...prev,
      ...partial,
      channels: partial.channels
        ? cloneChannels({
            ...prev.channels,
            ...partial.channels,
            dingtalk: { ...prev.channels.dingtalk, ...(partial.channels.dingtalk ?? {}) },
            email: { ...prev.channels.email, ...(partial.channels.email ?? {}) },
          })
        : prev.channels,
    })
    persist()
    return parseNotifications(memory.notifications)
  },
  getDataSources(): DataSourcesSettings {
    return parseDataSources(memory.dataSources)
  },
  setDataSources(partial: Partial<DataSourcesSettings>): DataSourcesSettings {
    memory.dataSources = parseDataSources({
      ...memory.dataSources,
      ...partial,
      sources: partial.sources ?? memory.dataSources.sources,
    })
    persist()
    return parseDataSources(memory.dataSources)
  },
  upsertDataSource(input: Omit<DataSourceConfig, 'updatedAt'> & { updatedAt?: string }): DataSourceConfig {
    const sources = [...memory.dataSources.sources]
    const stamp = new Date().toISOString()
    const next: DataSourceConfig = {
      ...input,
      name: String(input.name || input.id).slice(0, 80),
      enabled: input.enabled !== false,
      updatedAt: stamp,
    }
    const idx = sources.findIndex((s) => s.id === next.id)
    if (idx >= 0) sources[idx] = next
    else sources.push(next)
    memory.dataSources = { sources }
    persist()
    return { ...next, headers: next.headers ? { ...next.headers } : undefined }
  },
  deleteDataSource(id: string): boolean {
    const before = memory.dataSources.sources.length
    memory.dataSources = {
      sources: memory.dataSources.sources.filter((s) => s.id !== id),
    }
    if (memory.dataSources.sources.length === before) return false
    persist()
    return true
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
    const chatIds = activeProvider.models.filter(isChatAiModel).map((m) => m.id)
    const selectedOnProvider = chatIds.includes(nextSelectedModel)
      ? nextSelectedModel
      : firstChatModelId(activeProvider.models) || activeIds[0] || ''

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
    const snapshot = { ...memory.fortune }
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IpcChannels.settings.fortuneUpdated, snapshot)
    }
    return snapshot
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
    memory.notifications = parseNotifications(snapshot.notifications)
    memory.fortune = parseFortuneSettings(snapshot.fortune ?? DEFAULT_FORTUNE_SETTINGS)
    memory.stocks = parseStocksSettings(snapshot.stocks ?? DEFAULT_STOCKS_SETTINGS)
    memory.mcp = parseMcpSettings(snapshot.mcp ?? DEFAULT_MCP_SETTINGS)
    memory.dataSources = parseDataSources(snapshot.dataSources ?? DEFAULT_DATA_SOURCES_SETTINGS)
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
      dataSources: memory.dataSources,
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
      memory.notifications = parseNotifications(entries.notifications)
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
    if (entries.dataSources) {
      memory.dataSources = parseDataSources(entries.dataSources)
    }
    persist()
  },
}

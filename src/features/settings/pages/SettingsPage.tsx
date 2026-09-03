import { useEffect, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import type {
  AiModelConfig,
  AppLocale,
  DesktopWidgetView,
  DialFaceStyle,
  FortuneAiProviderConfig,
  HexagramSchool,
  LaunchBehavior,
  McpServerStatus,
  McpTransport,
  MediaProfileId,
  StocksRangeKey,
  StocksSettings,
  ThemeMode,
} from '@shared'
import {
  AI_PROVIDER_PRESETS,
  ALL_STOCKS_RANGE_KEYS,
  DEFAULT_DESKTOP_WIDGET,
  DEFAULT_FORTUNE_SETTINGS,
  DEFAULT_NOTIFICATION_SETTINGS,
  DEFAULT_STOCKS_SETTINGS,
  DIAL_FACE_STYLES,
  HEXAGRAM_SCHOOLS,
  MEDIA_PROFILE_IDS,
  THEME_ACCENTS,
  aiModelIds,
  defaultAiModelConfig,
  firstModelId,
  mediaIdsFromModels,
  modelsFromProviderPreset,
} from '@shared'
import { setAppLocale } from '@renderer/shared/lib/i18n'
import { useTheme } from '@renderer/shared/hooks/useTheme'
import { SettingActionButton } from '@renderer/shared/ui/SettingActionButton'
import { SettingOption } from '@renderer/shared/ui/SettingOption'
import { ToggleSwitch } from '@renderer/shared/ui/ToggleSwitch'
import {
  IconBell,
  IconDial,
  IconDownload,
  IconEraser,
  IconImage,
  IconKey,
  IconLayers,
  IconMonitor,
  IconSettings,
  IconSkill,
  IconStocks,
  IconTrash,
  IconTray,
  IconUpload,
  IconSparkles,
  IconPlus,
} from '@renderer/shared/ui/icons'
import { BirthProfileForm } from '@renderer/features/fortune/components/BirthProfileForm'
import { HarnessPluginMarketplace } from '../components/HarnessPluginMarketplace'
import { AddModelModal } from '../components/AddModelModal'
import styles from './SettingsPage.module.css'

const themes: ThemeMode[] = ['light', 'dark', 'system']
const locales: AppLocale[] = ['zh-CN', 'en-US']
const launchBehaviors: LaunchBehavior[] = ['main', 'tray', 'widget']
const hexagramSchools: HexagramSchool[] = HEXAGRAM_SCHOOLS

const launchBehaviorMeta = {
  main: { icon: <IconMonitor />, tone: 'brand' as const },
  tray: { icon: <IconTray />, tone: 'accent' as const },
  widget: { icon: <IconDial />, tone: 'highlight' as const },
}

export function SettingsPage(): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const location = useLocation()
  const { theme, setTheme, accent, setAccent } = useTheme()
  const [widget, setWidget] = useState<DesktopWidgetView>({
    ...DEFAULT_DESKTOP_WIDGET,
    backgroundImageUrl: null,
    backgroundHistory: [],
  })
  const [launchAtLogin, setLaunchAtLogin] = useState(false)
  const [launchBehavior, setLaunchBehavior] = useState<LaunchBehavior>('main')
  const [fortuneDailyNotify, setFortuneDailyNotify] = useState(DEFAULT_NOTIFICATION_SETTINGS.fortuneDaily)
  const [stocksDailyNotify, setStocksDailyNotify] = useState(DEFAULT_NOTIFICATION_SETTINGS.stocksDaily)
  const [fortuneNotifyHour, setFortuneNotifyHour] = useState(DEFAULT_NOTIFICATION_SETTINGS.fortuneNotifyHour)
  const [stocksSettings, setStocksSettings] = useState<StocksSettings>({ ...DEFAULT_STOCKS_SETTINGS })
  const [hexagramSchool, setHexagramSchool] = useState<HexagramSchool>(DEFAULT_FORTUNE_SETTINGS.hexagramSchool)
  const [fortuneAiPolish, setFortuneAiPolish] = useState(DEFAULT_FORTUNE_SETTINGS.aiPolish)
  const [aiProviders, setAiProviders] = useState<FortuneAiProviderConfig[]>(DEFAULT_FORTUNE_SETTINGS.aiProviders)
  const [aiActiveProviderId, setAiActiveProviderId] = useState(DEFAULT_FORTUNE_SETTINGS.aiActiveProviderId)
  const [aiProviderName, setAiProviderName] = useState(DEFAULT_FORTUNE_SETTINGS.aiProviderName)
  const [aiBaseUrl, setAiBaseUrl] = useState(DEFAULT_FORTUNE_SETTINGS.aiBaseUrl)
  const [aiApiFormat, setAiApiFormat] = useState(DEFAULT_FORTUNE_SETTINGS.aiApiFormat)
  const [aiModel, setAiModel] = useState(DEFAULT_FORTUNE_SETTINGS.aiModel)
  const [aiApiKey, setAiApiKey] = useState(DEFAULT_FORTUNE_SETTINGS.aiApiKey)
  const [aiMediaProfile, setAiMediaProfile] = useState<MediaProfileId>('auto')
  const [modelModal, setModelModal] = useState<AiModelConfig | null | 'new'>(null)
  const [aiSavedHint, setAiSavedHint] = useState<string | null>(null)
  const [aiTesting, setAiTesting] = useState(false)
  const [aiTestHint, setAiTestHint] = useState<string | null>(null)
  const [backupMsg, setBackupMsg] = useState<string | null>(null)
  const [harnessSandboxRoot, setHarnessSandboxRoot] = useState('')
  const [harnessPluginsDir, setHarnessPluginsDir] = useState('')
  const [harnessHint, setHarnessHint] = useState<string | null>(null)
  const [cordisProfile, setCordisProfile] = useState('')
  const [cordisBundles, setCordisBundles] = useState('')
  const [sandboxBackend, setSandboxBackend] = useState('')
  const [dshWebDraft, setDshWebDraft] = useState('')
  const [embeddedDshDraft, setEmbeddedDshDraft] = useState(true)
  const [sandboxModeDraft, setSandboxModeDraft] = useState<'local' | 'ssh' | 'container'>('local')
  const [sshHostDraft, setSshHostDraft] = useState('')
  const [sshUserDraft, setSshUserDraft] = useState('')
  const [sshPathDraft, setSshPathDraft] = useState('')
  const [sshPortDraft, setSshPortDraft] = useState('')
  const [containerNameDraft, setContainerNameDraft] = useState('')
  const [containerWorkspaceDraft, setContainerWorkspaceDraft] = useState('/workspace')
  const [newProfileDraft, setNewProfileDraft] = useState('')
  const [newBundleDraft, setNewBundleDraft] = useState('')
  const [cordisProfileOptions, setCordisProfileOptions] = useState<string[]>([])

  type SettingsSection =
    | 'general'
    | 'display'
    | 'models'
    | 'fortune'
    | 'stocks'
    | 'skills'
    | 'mcp'
    | 'notifications'
    | 'data'
  const [section, setSection] = useState<SettingsSection>('models')

  const navItems: { id: SettingsSection; labelKey: string; icon: ReactNode }[] = [
    { id: 'general', labelKey: 'settings.nav.general', icon: <IconSettings /> },
    { id: 'display', labelKey: 'settings.nav.display', icon: <IconMonitor /> },
    { id: 'models', labelKey: 'settings.nav.models', icon: <IconKey /> },
    { id: 'fortune', labelKey: 'settings.nav.fortune', icon: <IconSparkles /> },
    { id: 'stocks', labelKey: 'settings.nav.stocks', icon: <IconStocks /> },
    { id: 'skills', labelKey: 'settings.nav.skills', icon: <IconSkill /> },
    { id: 'mcp', labelKey: 'settings.nav.mcp', icon: <IconLayers /> },
    { id: 'notifications', labelKey: 'settings.nav.notifications', icon: <IconBell /> },
    { id: 'data', labelKey: 'settings.nav.data', icon: <IconDownload /> },
  ]

  type McpDraft = {
    id: string
    name: string
    enabled: boolean
    transport: McpTransport
    command: string
    argsText: string
    url: string
    envPairs: Array<{ key: string; value: string }>
    headerPairs: Array<{ key: string; value: string }>
  }

  const [mcpServers, setMcpServers] = useState<McpDraft[]>([])
  const [mcpStatuses, setMcpStatuses] = useState<McpServerStatus[]>([])
  const [mcpToolCount, setMcpToolCount] = useState(0)
  const [mcpRefreshing, setMcpRefreshing] = useState(false)

  type SkillRow = {
    id: string
    name: string
    description: string
    source: string
    sourceRef?: string
    prompt: string
  }
  const [skills, setSkills] = useState<SkillRow[]>([])
  const [skillCatalogs, setSkillCatalogs] = useState<
    Array<{ id: string; name: string; url: string; hint: string }>
  >([])
  const [skillInstallRef, setSkillInstallRef] = useState('')
  const [skillBusy, setSkillBusy] = useState(false)
  const [skillHint, setSkillHint] = useState<string | null>(null)

  const toMcpDraft = (s: {
    id: string
    name: string
    enabled: boolean
    transport?: McpTransport
    command: string
    args?: string[]
    url?: string
    env?: Record<string, string>
    headers?: Record<string, string>
  }): McpDraft => ({
    id: s.id,
    name: s.name,
    enabled: s.enabled,
    transport: s.transport === 'sse' ? 'sse' : 'stdio',
    command: s.command,
    argsText: (s.args ?? []).join(' '),
    url: s.url ?? '',
    envPairs: Object.entries(s.env ?? {}).map(([key, value]) => ({ key, value })),
    headerPairs: Object.entries(s.headers ?? {}).map(([key, value]) => ({ key, value })),
  })

  const applyMcpStatus = (snap: { servers: McpServerStatus[]; toolCount: number }): void => {
    setMcpStatuses(snap.servers)
    setMcpToolCount(snap.toolCount)
  }

  const refreshSkills = async (): Promise<void> => {
    const [list, catalogs] = await Promise.all([
      window.treasureChest.listSkills(),
      window.treasureChest.listSkillCatalogs(),
    ])
    setSkills(list)
    setSkillCatalogs(catalogs)
  }

  useEffect(() => {
    const fromState = (location.state as { section?: SettingsSection } | null)?.section
    if (fromState) setSection(fromState)
  }, [location.state])

  useEffect(() => {
    if (section !== 'skills') return
    void refreshSkills().catch(() => {
      setSkillHint(t('settings.skills.loadFailed'))
    })
  }, [section, t])

  useEffect(() => {
    if (section !== 'data') return
    void Promise.all([
      window.treasureChest.harnessGetSandboxRoot(),
      window.treasureChest.harnessGetPluginsDir(),
      window.treasureChest.harnessGetCordisStack(),
      window.treasureChest.harnessGetSandboxBackend(),
      window.treasureChest.harnessGetDshWebUrl(),
      window.treasureChest.harnessGetEmbeddedDshWebPreferred(),
      window.treasureChest.harnessListCordisProfiles(),
    ]).then(([sandbox, plugins, stack, backend, dshUrl, embeddedDsh, profiles]) => {
      setHarnessSandboxRoot(sandbox)
      setHarnessPluginsDir(plugins)
      setCordisProfile(stack.profileId)
      setCordisBundles(stack.bundleIds.join(', '))
      setSandboxBackend(`${backend.mode}: ${backend.label}`)
      setDshWebDraft(dshUrl)
      setEmbeddedDshDraft(embeddedDsh)
      setSandboxModeDraft(stack.sandboxMode)
      setSshHostDraft(stack.ssh?.host ?? '')
      setSshUserDraft(stack.ssh?.user ?? '')
      setSshPathDraft(stack.ssh?.remotePath ?? '')
      setSshPortDraft(stack.ssh?.port ? String(stack.ssh.port) : '')
      setContainerNameDraft(stack.container?.containerName ?? '')
      setContainerWorkspaceDraft(stack.container?.workspacePath ?? '/workspace')
      setCordisProfileOptions(profiles)
    })
  }, [section])

  useEffect(() => {
    void window.treasureChest.getDesktopWidget().then(setWidget)
    void window.treasureChest.getSettingsSnapshot().then((snap) => {
      setLaunchBehavior(snap.launchBehavior)
      setFortuneDailyNotify(snap.notifications?.fortuneDaily ?? DEFAULT_NOTIFICATION_SETTINGS.fortuneDaily)
      setStocksDailyNotify(snap.notifications?.stocksDaily ?? DEFAULT_NOTIFICATION_SETTINGS.stocksDaily)
      setFortuneNotifyHour(snap.notifications?.fortuneNotifyHour ?? DEFAULT_NOTIFICATION_SETTINGS.fortuneNotifyHour)
      setStocksSettings(snap.stocks ?? DEFAULT_STOCKS_SETTINGS)
      setHexagramSchool(snap.fortune?.hexagramSchool ?? DEFAULT_FORTUNE_SETTINGS.hexagramSchool)
      setFortuneAiPolish(snap.fortune?.aiPolish ?? DEFAULT_FORTUNE_SETTINGS.aiPolish)
      setAiProviders(snap.fortune?.aiProviders ?? DEFAULT_FORTUNE_SETTINGS.aiProviders)
      setAiActiveProviderId(snap.fortune?.aiActiveProviderId ?? DEFAULT_FORTUNE_SETTINGS.aiActiveProviderId)
      setAiProviderName(snap.fortune?.aiProviderName ?? DEFAULT_FORTUNE_SETTINGS.aiProviderName)
      setAiBaseUrl(snap.fortune?.aiBaseUrl ?? DEFAULT_FORTUNE_SETTINGS.aiBaseUrl)
      setAiApiFormat(snap.fortune?.aiApiFormat ?? DEFAULT_FORTUNE_SETTINGS.aiApiFormat)
      setAiModel(snap.fortune?.aiModel ?? DEFAULT_FORTUNE_SETTINGS.aiModel)
      setAiApiKey(snap.fortune?.aiApiKey ?? DEFAULT_FORTUNE_SETTINGS.aiApiKey)
      {
        const active =
          (snap.fortune?.aiProviders ?? []).find((p) => p.id === snap.fortune?.aiActiveProviderId) ??
          snap.fortune?.aiProviders?.[0]
        setAiMediaProfile(active?.mediaProfile ?? 'auto')
      }
    })
    void window.treasureChest.getMcpSettings().then((mcp) => {
      setMcpServers(mcp.servers.map(toMcpDraft))
    })
    void window.treasureChest.getMcpStatus().then(applyMcpStatus)
    void window.treasureChest.getLaunchAtLogin().then((state) => {
      setLaunchAtLogin(state.configured)
    })
  }, [])

  const saveMcpServers = (next: McpDraft[], refresh = true): void => {
    setMcpServers(next)
    void window.treasureChest
      .setMcpSettings({
        servers: next
          .filter((s) =>
            s.transport === 'sse' ? Boolean(s.url.trim()) : Boolean(s.command.trim()),
          )
          .map((s) => ({
            id: s.id,
            name: s.name.trim() || s.id,
            enabled: s.enabled,
            transport: s.transport,
            command: s.command.trim(),
            args: s.argsText.trim() ? s.argsText.trim().split(/\s+/) : [],
            url: s.url.trim() || undefined,
            env: Object.fromEntries(
              s.envPairs.filter((p) => p.key.trim()).map((p) => [p.key.trim(), p.value]),
            ),
            headers: Object.fromEntries(
              s.headerPairs.filter((p) => p.key.trim()).map((p) => [p.key.trim(), p.value]),
            ),
          })),
      })
      .then((saved) => {
        setMcpServers(saved.servers.map(toMcpDraft))
        if (refresh) {
          setMcpRefreshing(true)
          void window.treasureChest
            .refreshMcpStatus()
            .then(applyMcpStatus)
            .finally(() => setMcpRefreshing(false))
        }
      })
  }

  const mcpStatusOf = (id: string): McpServerStatus | undefined =>
    mcpStatuses.find((s) => s.id === id)

  const onLocale = async (locale: AppLocale): Promise<void> => {
    await window.treasureChest.setLocale(locale)
    await setAppLocale(locale)
  }

  const patchWidget = async (
    partial: Parameters<typeof window.treasureChest.setDesktopWidget>[0],
  ): Promise<void> => {
    const next = await window.treasureChest.setDesktopWidget(partial)
    setWidget(next)
  }

  const onPickFace = (dialFace: DialFaceStyle): void => {
    void patchWidget({ dialFace })
  }

  const onLaunchAtLogin = (enabled: boolean): void => {
    void window.treasureChest.setLaunchAtLogin(enabled).then((state) => {
      setLaunchAtLogin(state.configured)
    })
  }

  const onLaunchBehavior = (behavior: LaunchBehavior): void => {
    void window.treasureChest.setLaunchBehavior(behavior).then(setLaunchBehavior)
  }

  const onFortuneDailyNotify = (fortuneDaily: boolean): void => {
    void window.treasureChest.setNotifications({ fortuneDaily }).then((next) => {
      setFortuneDailyNotify(next.fortuneDaily)
    })
  }

  const onFortuneNotifyHour = (hour: number): void => {
    void window.treasureChest.setNotifications({ fortuneNotifyHour: hour }).then((next) => {
      setFortuneNotifyHour(next.fortuneNotifyHour)
    })
  }

  const onStocksDailyNotify = (stocksDaily: boolean): void => {
    void window.treasureChest.setNotifications({ stocksDaily }).then((next) => {
      setStocksDailyNotify(next.stocksDaily)
    })
  }

  const patchStocks = (partial: Partial<StocksSettings>): void => {
    void window.treasureChest.setStocksSettings(partial).then(setStocksSettings)
  }

  const onToggleRange = (key: StocksRangeKey): void => {
    const current = stocksSettings.defaultRanges
    const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key]
    const ordered = ALL_STOCKS_RANGE_KEYS.filter((k) => next.includes(k))
    patchStocks({ defaultRanges: ordered.length > 0 ? ordered : ['d1', 'w1', 'm1', 'm3'] })
  }

  const onHexagramSchool = (school: HexagramSchool): void => {
    void window.treasureChest.setFortuneSettings({ hexagramSchool: school }).then((next) => {
      setHexagramSchool(next.hexagramSchool)
    })
  }

  const onFortuneAiPolish = (aiPolish: boolean): void => {
    void window.treasureChest.setFortuneSettings({ aiPolish }).then((next) => {
      setFortuneAiPolish(next.aiPolish)
    })
  }

  const onExportBackup = (): void => {
    void window.treasureChest.exportBackup().then((result) => {
      if (result.ok && result.path) {
        setBackupMsg(t('settings.backupExported', { path: result.path }))
      } else if (result.error) {
        setBackupMsg(t('settings.backupFailed', { error: result.error }))
      }
    })
  }

  const onImportBackup = (): void => {
    void window.treasureChest.importBackup().then(async (result) => {
      if (result.ok) {
        setBackupMsg(t('settings.backupImported'))
        const snap = await window.treasureChest.getSettingsSnapshot()
        setLaunchBehavior(snap.launchBehavior)
        setFortuneDailyNotify(snap.notifications?.fortuneDaily ?? DEFAULT_NOTIFICATION_SETTINGS.fortuneDaily)
        setStocksDailyNotify(snap.notifications?.stocksDaily ?? DEFAULT_NOTIFICATION_SETTINGS.stocksDaily)
        setFortuneNotifyHour(snap.notifications?.fortuneNotifyHour ?? DEFAULT_NOTIFICATION_SETTINGS.fortuneNotifyHour)
        setStocksSettings(snap.stocks ?? DEFAULT_STOCKS_SETTINGS)
        setHexagramSchool(snap.fortune?.hexagramSchool ?? DEFAULT_FORTUNE_SETTINGS.hexagramSchool)
        setFortuneAiPolish(snap.fortune?.aiPolish ?? DEFAULT_FORTUNE_SETTINGS.aiPolish)
        setAiProviders(snap.fortune?.aiProviders ?? DEFAULT_FORTUNE_SETTINGS.aiProviders)
        setAiActiveProviderId(snap.fortune?.aiActiveProviderId ?? DEFAULT_FORTUNE_SETTINGS.aiActiveProviderId)
        setAiProviderName(snap.fortune?.aiProviderName ?? DEFAULT_FORTUNE_SETTINGS.aiProviderName)
        setAiBaseUrl(snap.fortune?.aiBaseUrl ?? DEFAULT_FORTUNE_SETTINGS.aiBaseUrl)
        setAiApiFormat(snap.fortune?.aiApiFormat ?? DEFAULT_FORTUNE_SETTINGS.aiApiFormat)
        setAiModel(snap.fortune?.aiModel ?? DEFAULT_FORTUNE_SETTINGS.aiModel)
        setAiApiKey(snap.fortune?.aiApiKey ?? DEFAULT_FORTUNE_SETTINGS.aiApiKey)
        {
          const active =
            (snap.fortune?.aiProviders ?? []).find((p) => p.id === snap.fortune?.aiActiveProviderId) ??
            snap.fortune?.aiProviders?.[0]
          setAiMediaProfile(active?.mediaProfile ?? 'auto')
        }
        const login = await window.treasureChest.getLaunchAtLogin()
        setLaunchAtLogin(login.configured)
        const w = await window.treasureChest.getDesktopWidget()
        setWidget(w)
      } else if (result.error) {
        setBackupMsg(t('settings.backupFailed', { error: result.error }))
      }
    })
  }

  const onPickHarnessSandbox = (): void => {
    setHarnessHint(null)
    void window.treasureChest.harnessPickSandboxRoot().then((path) => {
      if (path) {
        setHarnessSandboxRoot(path)
        setHarnessHint(t('settings.harnessSandboxUpdated'))
      }
    })
  }

  const onSaveAiConfig = (): void => {
    setAiSavedHint(null)
    const current =
      aiProviders.find((p) => p.id === aiActiveProviderId) ?? aiProviders[0]
    const resolvedModels = current?.models ?? []
    const ids = aiModelIds(resolvedModels)
    const resolvedModel = ids.includes(aiModel.trim()) ? aiModel.trim() : (ids[0] ?? '')
    const media = mediaIdsFromModels(resolvedModels)
    const nextProviders = aiProviders.map((provider) =>
      provider.id === aiActiveProviderId
        ? {
            ...provider,
            name: aiProviderName.trim() || provider.name,
            baseUrl: aiBaseUrl.trim() || provider.baseUrl,
            apiFormat: aiApiFormat,
            models: resolvedModels,
            apiKey: aiApiKey.trim(),
            mediaProfile: aiMediaProfile,
            imageModel: media.imageModel,
            videoModel: media.videoModel,
            musicModel: media.musicModel,
          }
        : provider,
    )

    void window.treasureChest
      .setFortuneSettings({
        aiProviderName: aiProviderName.trim(),
        aiBaseUrl: aiBaseUrl.trim(),
        aiApiFormat,
        aiModels: ids,
        aiModel: resolvedModel,
        aiApiKey: aiApiKey.trim(),
        aiProviders: nextProviders,
        aiActiveProviderId,
      })
      .then((next) => {
        setAiProviders(next.aiProviders)
        setAiActiveProviderId(next.aiActiveProviderId)
        setAiProviderName(next.aiProviderName)
        setAiBaseUrl(next.aiBaseUrl)
        setAiApiFormat(next.aiApiFormat)
        setAiModel(next.aiModel)
        setAiApiKey(next.aiApiKey)
        {
          const active =
            next.aiProviders.find((p) => p.id === next.aiActiveProviderId) ?? next.aiProviders[0]
          setAiMediaProfile(active?.mediaProfile ?? 'auto')
        }
        setAiSavedHint(t('settings.fortuneAiConfigSaved'))
      })
  }

  const onTestAiConnection = (): void => {
    const current = aiProviders.find((p) => p.id === aiActiveProviderId)
    const model = aiModel.trim() || firstModelId(current?.models ?? [])
    if (!model) {
      setAiTestHint(t('settings.fortuneAiNeedModel'))
      return
    }
    const provider: FortuneAiProviderConfig = {
      id: aiActiveProviderId || 'temp-provider',
      name: aiProviderName.trim() || 'Provider',
      baseUrl: aiBaseUrl.trim(),
      apiFormat: aiApiFormat,
      models: current?.models?.length ? current.models : [defaultAiModelConfig(model)],
      apiKey: aiApiKey.trim(),
    }
    setAiTesting(true)
    setAiTestHint(t('settings.fortuneAiTesting'))
    void window.treasureChest.testFortuneAiConnection({ provider, model }).then((res) => {
      setAiTesting(false)
      setAiTestHint(res.ok ? t('settings.fortuneAiTestPassed', { message: res.message }) : t('settings.fortuneAiTestFailed', { error: res.message }))
    })
  }

  const patchActiveModels = (models: AiModelConfig[]): void => {
    setAiProviders((prev) =>
      prev.map((p) => (p.id === aiActiveProviderId ? { ...p, models } : p)),
    )
    const ids = aiModelIds(models)
    if (!ids.includes(aiModel)) setAiModel(ids[0] ?? '')
  }

  const onSaveAiModel = (model: AiModelConfig): void => {
    const current = aiProviders.find((p) => p.id === aiActiveProviderId)?.models ?? []
    const oldId = typeof modelModal === 'object' && modelModal ? modelModal.id : ''
    const without = oldId ? current.filter((m) => m.id !== oldId) : current.filter((m) => m.id !== model.id)
    const next = without.some((m) => m.id === model.id)
      ? without.map((m) => (m.id === model.id ? model : m))
      : [...without, model]
    patchActiveModels(next)
    setAiModel(model.id)
    setModelModal(null)
  }

  const onRemoveAiModel = (modelId: string): void => {
    const current = aiProviders.find((p) => p.id === aiActiveProviderId)?.models ?? []
    patchActiveModels(current.filter((m) => m.id !== modelId))
  }

  const onSelectProvider = (id: string): void => {
    const provider = aiProviders.find((p) => p.id === id)
    if (!provider) return
    setAiActiveProviderId(provider.id)
    setAiProviderName(provider.name)
    setAiBaseUrl(provider.baseUrl)
    setAiApiFormat(provider.apiFormat)
    setAiModel(firstModelId(provider.models))
    setAiApiKey(provider.apiKey)
    setAiMediaProfile(provider.mediaProfile ?? 'auto')
  }

  const onAddProvider = (): void => {
    const id = `provider-${Date.now()}`
    const next: FortuneAiProviderConfig = {
      id,
      name: `Provider ${aiProviders.length + 1}`,
      baseUrl: 'https://api.example.com/v1',
      apiFormat: 'openai',
      models: [],
      apiKey: '',
      mediaProfile: 'auto',
    }
    const nextProviders = [...aiProviders, next]
    setAiProviders(nextProviders)
    setAiActiveProviderId(next.id)
    setAiProviderName(next.name)
    setAiBaseUrl(next.baseUrl)
    setAiApiFormat(next.apiFormat)
    setAiModel('')
    setAiApiKey(next.apiKey)
    setAiMediaProfile('auto')
  }

  const applyCloudPreset = (presetId: string): void => {
    const preset = AI_PROVIDER_PRESETS.find((p) => p.id === presetId)
    if (!preset) return
    const models = modelsFromProviderPreset(preset)
    setAiProviderName(t(preset.nameKey))
    setAiBaseUrl(preset.baseUrl)
    setAiApiFormat(preset.apiFormat)
    setAiMediaProfile(preset.mediaProfile)
    setAiProviders((prev) =>
      prev.map((p) =>
        p.id === aiActiveProviderId
          ? {
              ...p,
              name: t(preset.nameKey),
              baseUrl: preset.baseUrl,
              apiFormat: preset.apiFormat,
              mediaProfile: preset.mediaProfile,
              models,
              imageModel: preset.imageModel,
              videoModel: preset.videoModel,
              musicModel: preset.musicModel,
            }
          : p,
      ),
    )
    setAiModel(firstModelId(models))
  }

  const applyLocalPreset = (kind: 'ollama' | 'lmstudio'): void => {
    const isOllama = kind === 'ollama'
    const name = isOllama ? 'Ollama' : 'LM Studio'
    const baseUrl = isOllama ? 'http://127.0.0.1:11434/v1' : 'http://127.0.0.1:1234/v1'
    const fallbackId = isOllama ? 'qwen2.5:7b' : 'local-model'
    const current = aiProviders.find((p) => p.id === aiActiveProviderId)?.models ?? []
    const models = current.length > 0 ? current : [defaultAiModelConfig(fallbackId)]
    setAiProviderName(name)
    setAiBaseUrl(baseUrl)
    setAiApiFormat('openai')
    setAiApiKey('')
    setAiMediaProfile('openai_compat')
    setAiProviders((prev) =>
      prev.map((p) =>
        p.id === aiActiveProviderId
          ? { ...p, name, baseUrl, apiFormat: 'openai', mediaProfile: 'openai_compat', models }
          : p,
      ),
    )
    if (current.length === 0) setAiModel(fallbackId)
  }

  const onRemoveProvider = (id: string): void => {
    const next = aiProviders.filter((p) => p.id !== id)
    if (next.length === 0) return
    setAiProviders(next)
    if (aiActiveProviderId === id) {
      const first = next[0]!
      setAiActiveProviderId(first.id)
      setAiProviderName(first.name)
      setAiBaseUrl(first.baseUrl)
      setAiApiFormat(first.apiFormat)
      setAiModel(firstModelId(first.models))
      setAiApiKey(first.apiKey)
      setAiMediaProfile(first.mediaProfile ?? 'auto')
    }
  }

  return (
    <div className={styles.shell}>
      <aside className={styles.side}>
        <h1 className={styles.sideTitle}>{t('settings.title')}</h1>
        <p className={styles.sideHint}>{t('settings.subtitle')}</p>
        <nav className={styles.sideNav}>
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`${styles.sideLink} ${section === item.id ? styles.sideLinkActive : ''}`}
              onClick={() => setSection(item.id)}
            >
              <span className={styles.sideIcon}>{item.icon}</span>
              {t(item.labelKey)}
            </button>
          ))}
        </nav>
      </aside>

      <section className={styles.page}>
        <h2 className={styles.title}>{t(`settings.nav.${section}`)}</h2>

      <div className={styles.group} hidden={section !== 'display'}>
        <h2 className={styles.label}>{t('settings.appearance')}</h2>
        <p className={styles.desc}>{t('settings.appearanceDesc')}</p>

        <div className={styles.settingRow}>
          <div>
            <div className={styles.settingTitle}>{t('settings.theme')}</div>
            <div className={styles.settingHint}>{t('settings.themeHint')}</div>
          </div>
          <div className={styles.choiceControl}>
            {themes.map((mode) => (
              <button
                key={mode}
                type="button"
                className={`${styles.rangeChip} ${theme === mode ? styles.rangeChipActive : ''}`}
                onClick={() => void setTheme(mode)}
                aria-pressed={theme === mode}
              >
                {t(`settings.theme.${mode}`)}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.faceBlock}>
          <div className={styles.settingTitle}>{t('settings.themeAccent')}</div>
          <div className={styles.settingHint}>{t('settings.themeAccentHint')}</div>
          <div className={styles.accentSwatches}>
            {THEME_ACCENTS.map((id) => (
              <button
                key={id}
                type="button"
                className={`${styles.accentSwatch} ${styles[`accent_${id}`]} ${
                  accent === id ? styles.accentSwatchActive : ''
                }`}
                onClick={() => void setAccent(id)}
                aria-pressed={accent === id}
                title={t(`settings.themeAccent.${id}`)}
                aria-label={t(`settings.themeAccent.${id}`)}
              >
                <span className={styles.accentSwatchDot} aria-hidden />
                <span className={styles.accentSwatchLabel}>{t(`settings.themeAccent.${id}`)}</span>
              </button>
            ))}
          </div>
        </div>

        <div className={styles.faceBlock}>
          <div className={styles.settingTitle}>{t('settings.desktopWidget.dialFace')}</div>
          <div className={styles.settingHint}>{t('settings.desktopWidget.dialFaceHint')}</div>
          <div className={styles.faceGrid}>
            {DIAL_FACE_STYLES.map((face) => {
              const previewClass = {
                teal: styles.face_teal,
                ink: styles.face_ink,
                dawn: styles.face_dawn,
                minimal: styles.face_minimal,
                azure: styles.face_azure,
                rose: styles.face_rose,
                violet: styles.face_violet,
                forest: styles.face_forest,
              }[face]
              return (
                <button
                  key={face}
                  type="button"
                  className={`${styles.faceCard} ${widget.dialFace === face ? styles.faceCardActive : ''}`}
                  onClick={() => onPickFace(face)}
                  aria-pressed={widget.dialFace === face}
                >
                  <span className={`${styles.facePreview} ${previewClass}`} aria-hidden>
                    <span className={styles.facePreviewHand} />
                  </span>
                  <span className={styles.faceName}>{t(`settings.dialFace.${face}`)}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className={styles.settingRow}>
          <div>
            <div className={styles.settingTitle}>{t('settings.desktopWidget.showTicks')}</div>
            <div className={styles.settingHint}>{t('settings.desktopWidget.showTicksHint')}</div>
          </div>
          <ToggleSwitch
            checked={widget.showTicks}
            label={t('settings.desktopWidget.showTicks')}
            onChange={(showTicks) => void patchWidget({ showTicks })}
          />
        </div>
      </div>

      <div className={styles.group} hidden={section !== 'display'}>
        <h2 className={styles.label}>{t('settings.desktopWidget')}</h2>
        <p className={styles.desc}>{t('settings.desktopWidget.desc')}</p>

        <div className={styles.settingRow}>
          <div>
            <div className={styles.settingTitle}>{t('settings.desktopWidget.enabled')}</div>
            <div className={styles.settingHint}>{t('settings.desktopWidget.enabledHint')}</div>
          </div>
          <ToggleSwitch
            checked={widget.enabled}
            label={t('settings.desktopWidget.enabled')}
            onChange={(enabled) => void patchWidget({ enabled })}
          />
        </div>

        <div className={styles.settingRow}>
          <div>
            <div className={styles.settingTitle}>{t('settings.desktopWidget.keepAlive')}</div>
            <div className={styles.settingHint}>{t('settings.desktopWidget.keepAliveHint')}</div>
          </div>
          <ToggleSwitch
            checked={widget.keepAlive}
            label={t('settings.desktopWidget.keepAlive')}
            onChange={(keepAlive) => void patchWidget({ keepAlive })}
          />
        </div>

        <div className={styles.faceBlock}>
          <div className={styles.settingTitle}>{t('settings.desktopWidget.background')}</div>
          <div className={styles.settingHint}>{t('settings.desktopWidget.backgroundHint')}</div>
          <div className={styles.bgRow}>
            <div
              className={styles.bgPreview}
              style={
                widget.backgroundImageUrl
                  ? { backgroundImage: `url(${widget.backgroundImageUrl})` }
                  : undefined
              }
            />
            <div className={styles.bgActions}>
              <SettingActionButton
                icon={<IconImage />}
                label={t('settings.desktopWidget.pickBackground')}
                variant="primary"
                onClick={() => void window.treasureChest.pickDialBackground().then(setWidget)}
              />
              <SettingActionButton
                icon={<IconEraser />}
                label={t('settings.desktopWidget.clearBackground')}
                variant="ghost"
                disabled={!widget.backgroundImagePath}
                onClick={() => void window.treasureChest.clearDialBackground().then(setWidget)}
              />
            </div>
          </div>

          {widget.backgroundHistory.length > 0 ? (
            <div className={styles.bgHistory}>
              <div className={styles.bgHistoryLabel}>{t('settings.desktopWidget.backgroundHistory')}</div>
              <div className={styles.bgHistoryGrid}>
                {widget.backgroundHistory.map((item) => {
                  const active = widget.backgroundImagePath === item.path
                  return (
                    <div
                      key={item.path}
                      className={`${styles.bgHistoryItem} ${active ? styles.bgHistoryItemActive : ''}`}
                    >
                      <button
                        type="button"
                        className={styles.bgHistoryThumb}
                        style={{ backgroundImage: `url(${item.url})` }}
                        aria-label={t('settings.desktopWidget.useBackground')}
                        aria-pressed={active}
                        onClick={() =>
                          void window.treasureChest.selectDialBackground(item.path).then(setWidget)
                        }
                      />
                      <button
                        type="button"
                        className={styles.bgHistoryDelete}
                        aria-label={t('settings.desktopWidget.deleteBackground')}
                        title={t('settings.desktopWidget.deleteBackground')}
                        onClick={(e) => {
                          e.stopPropagation()
                          void window.treasureChest.deleteDialBackground(item.path).then(setWidget)
                        }}
                      >
                        <IconTrash />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className={styles.group} hidden={section !== 'general'}>
        <h2 className={styles.label}>{t('settings.system')}</h2>

        <div className={styles.settingRow}>
          <div>
            <div className={styles.settingTitle}>{t('settings.launchAtLogin')}</div>
            <div className={styles.settingHint}>{t('settings.launchAtLoginHint')}</div>
          </div>
          <ToggleSwitch
            checked={launchAtLogin}
            label={t('settings.launchAtLogin')}
            onChange={onLaunchAtLogin}
          />
        </div>

        <div className={styles.faceBlock}>
          <div className={styles.settingTitle}>{t('settings.launchBehavior')}</div>
          <div className={styles.optionGrid}>
            {launchBehaviors.map((behavior) => (
              <SettingOption
                key={behavior}
                icon={launchBehaviorMeta[behavior].icon}
                tone={launchBehaviorMeta[behavior].tone}
                label={t(`settings.launchBehavior.${behavior}`)}
                description={t(`settings.launchBehaviorHint.${behavior}`)}
                active={launchBehavior === behavior}
                onClick={() => onLaunchBehavior(behavior)}
              />
            ))}
          </div>
        </div>

        <div className={styles.settingRow}>
          <div>
            <div className={styles.settingTitle}>{t('settings.language')}</div>
            <div className={styles.settingHint}>{t('settings.languageHint')}</div>
          </div>
          <div className={styles.choiceControl}>
            {locales.map((locale) => (
              <button
                key={locale}
                type="button"
                className={`${styles.rangeChip} ${i18n.language === locale ? styles.rangeChipActive : ''}`}
                onClick={() => void onLocale(locale)}
                aria-pressed={i18n.language === locale}
              >
                {t(`settings.locale.${locale}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.group} hidden={section !== 'fortune'}>
        <h2 className={styles.label}>{t('settings.fortuneProfile')}</h2>
        <p className={styles.desc}>{t('settings.fortuneProfileDesc')}</p>
        <div className={styles.profileBlock}>
          <BirthProfileForm compact />
        </div>

        <div className={styles.faceBlock}>
          <div className={styles.settingTitle}>{t('settings.hexagramSchool')}</div>
          <div className={styles.settingHint}>{t('settings.hexagramSchoolHint')}</div>
          <div className={styles.rangeChips}>
            {hexagramSchools.map((school) => (
              <button
                key={school}
                type="button"
                className={`${styles.rangeChip} ${hexagramSchool === school ? styles.rangeChipActive : ''}`}
                onClick={() => onHexagramSchool(school)}
                aria-pressed={hexagramSchool === school}
              >
                {t(`settings.hexagramSchool.${school}`)}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.settingRow}>
          <div>
            <div className={styles.settingTitleRow}>
              <span className={styles.settingTitleIcon} aria-hidden>
                <IconSparkles />
              </span>
              <span>{t('settings.fortuneAiPolish')}</span>
            </div>
            <div className={styles.settingHint}>{t('settings.fortuneAiPolishHint')}</div>
          </div>
          <ToggleSwitch
            checked={fortuneAiPolish}
            label={t('settings.fortuneAiPolish')}
            onChange={onFortuneAiPolish}
          />
        </div>

      </div>

      <div className={styles.group} hidden={section !== 'models'}>
        <h2 className={styles.label}>{t('settings.modelsTitle')}</h2>
        <p className={styles.desc}>{t('settings.modelsHint')}</p>
        <div className={styles.localPresetRow}>
          <span className={styles.localPresetLabel}>{t('settings.modelsLocalPresets')}</span>
          <button type="button" className={styles.localPresetBtn} onClick={() => applyLocalPreset('ollama')}>
            {t('settings.modelsPreset.ollama')}
          </button>
          <button type="button" className={styles.localPresetBtn} onClick={() => applyLocalPreset('lmstudio')}>
            {t('settings.modelsPreset.lmstudio')}
          </button>
        </div>
        <div className={styles.localPresetRow}>
          <span className={styles.localPresetLabel}>{t('settings.modelsCloudPresets')}</span>
          {AI_PROVIDER_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={styles.localPresetBtn}
              onClick={() => applyCloudPreset(preset.id)}
            >
              {t(preset.nameKey)}
            </button>
          ))}
        </div>
        <p className={styles.settingHint}>{t('settings.modelsPresetHint')}</p>
        <p className={styles.settingHint}>{t('settings.modelsLocalHint')}</p>
        <div className={styles.aiProviderRow}>
          <div className={styles.aiProviderList}>
            {aiProviders.map((provider) => (
              <div
                key={provider.id}
                className={`${styles.aiProviderChip} ${provider.id === aiActiveProviderId ? styles.aiProviderChipActive : ''}`}
              >
                <button type="button" className={styles.aiProviderPickBtn} onClick={() => onSelectProvider(provider.id)}>
                  {provider.name}
                </button>
                {aiProviders.length > 1 ? (
                  <button type="button" className={styles.aiProviderRemoveBtn} onClick={() => onRemoveProvider(provider.id)}>
                    ×
                  </button>
                ) : null}
              </div>
            ))}
          </div>
          <button type="button" className={styles.aiAddBtn} onClick={onAddProvider}>
            + {t('settings.fortuneAiProviderAdd')}
          </button>
        </div>
        <div className={styles.aiGrid}>
          <label className={styles.aiField}>
            <span className={styles.aiLabel}>{t('settings.fortuneAiProviderName')}</span>
            <input
              className={styles.aiInput}
              value={aiProviderName}
              onChange={(e) => setAiProviderName(e.target.value)}
              placeholder={t('settings.fortuneAiProviderNamePlaceholder')}
            />
          </label>
          <label className={styles.aiField}>
            <span className={styles.aiLabel}>{t('settings.fortuneAiBaseUrl')}</span>
            <input
              className={styles.aiInput}
              value={aiBaseUrl}
              onChange={(e) => setAiBaseUrl(e.target.value)}
              placeholder={t('settings.fortuneAiBaseUrlPlaceholder')}
            />
          </label>
          <label className={styles.aiField}>
            <span className={styles.aiLabel}>{t('settings.fortuneAiApiKey')}</span>
            <input
              className={styles.aiInput}
              value={aiApiKey}
              onChange={(e) => setAiApiKey(e.target.value)}
              placeholder={t('settings.fortuneAiApiKeyPlaceholder')}
              type="password"
              autoComplete="off"
            />
          </label>
          <label className={styles.aiField}>
            <span className={styles.aiLabel}>{t('settings.fortuneAiFormat')}</span>
            <select
              className={styles.aiSelect}
              value={aiApiFormat}
              onChange={(e) => setAiApiFormat(e.target.value as 'openai' | 'anthropic')}
            >
              <option value="openai">{t('settings.fortuneAiFormat.openai')}</option>
              <option value="anthropic">{t('settings.fortuneAiFormat.anthropic')}</option>
            </select>
          </label>
          <label className={styles.aiField}>
            <span className={styles.aiLabel}>{t('settings.mediaProfile')}</span>
            <select
              className={styles.aiSelect}
              value={aiMediaProfile}
              onChange={(e) => setAiMediaProfile(e.target.value as MediaProfileId)}
            >
              {MEDIA_PROFILE_IDS.map((id) => (
                <option key={id} value={id}>
                  {t(`settings.mediaProfile.${id}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className={styles.settingHint}>{t('settings.mediaProfileHint')}</p>
        <div className={styles.aiModelBlock}>
          <div className={styles.aiLabel}>{t('settings.fortuneAiModelList')}</div>
          <p className={styles.settingHint}>{t('settings.fortuneAiModelHint')}</p>
          <button type="button" className={styles.aiAddBtn} onClick={() => setModelModal('new')}>
            + {t('settings.fortuneAiModelAdd')}
          </button>
          <div className={styles.aiModelList}>
            {(aiProviders.find((p) => p.id === aiActiveProviderId)?.models ?? []).map((model) => (
              <div
                key={model.id}
                className={`${styles.aiModelRow} ${aiModel === model.id ? styles.aiModelRowActive : ''}`}
              >
                <button type="button" className={styles.aiModelPickBtn} onClick={() => setAiModel(model.id)}>
                  <span className={styles.aiModelId}>{model.id}</span>
                  <span className={styles.aiModelCaps}>
                    {model.inputModalities.filter((m) => m !== 'text').map((m) => (
                      <span key={`in-${m}`} className={styles.aiModelCap}>
                        {t(`settings.modelModal.modality.${m}`)}
                        {t('settings.modelModal.capIn')}
                      </span>
                    ))}
                    {model.outputModalities.filter((m) => m !== 'text').map((m) => (
                      <span key={`out-${m}`} className={styles.aiModelCap}>
                        {t(`settings.modelModal.modality.${m}`)}
                        {t('settings.modelModal.capOut')}
                      </span>
                    ))}
                  </span>
                </button>
                <button
                  type="button"
                  className={styles.aiModelEditBtn}
                  onClick={() => setModelModal(model)}
                >
                  {t('settings.fortuneAiModelEdit')}
                </button>
                <button type="button" className={styles.aiModelRemoveBtn} onClick={() => onRemoveAiModel(model.id)}>
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
        {modelModal !== null ? (
          <AddModelModal
            initial={modelModal === 'new' ? null : modelModal}
            onClose={() => setModelModal(null)}
            onSave={onSaveAiModel}
          />
        ) : null}
        <div className={styles.aiActionRow}>
          <SettingActionButton
            icon={<IconSparkles />}
            label={t('settings.fortuneAiSaveConfig')}
            variant="secondary"
            onClick={onSaveAiConfig}
          />
          <SettingActionButton
            icon={<IconSparkles />}
            label={aiTesting ? t('settings.fortuneAiTesting') : t('settings.fortuneAiTestConnection')}
            variant="ghost"
            onClick={onTestAiConnection}
            disabled={aiTesting}
          />
        </div>
        {aiSavedHint ? <p className={styles.hint}>{aiSavedHint}</p> : null}
        {aiTestHint ? <p className={styles.hint}>{aiTestHint}</p> : null}
      </div>

      <div className={styles.group} hidden={section !== 'stocks'}>
        <h2 className={styles.label}>{t('settings.stocks')}</h2>
        <p className={styles.groupHint}>{t('settings.stocksHint')}</p>

        <div className={styles.settingRow}>
          <div>
            <div className={styles.settingTitle}>{t('settings.stocksMarketCN')}</div>
            <div className={styles.settingHint}>{t('settings.stocksMarketCNHint')}</div>
          </div>
          <ToggleSwitch
            checked={stocksSettings.marketCN}
            label={t('settings.stocksMarketCN')}
            onChange={(marketCN) => patchStocks({ marketCN })}
          />
        </div>

        <div className={styles.settingRow}>
          <div>
            <div className={styles.settingTitle}>{t('settings.stocksMarketUS')}</div>
            <div className={styles.settingHint}>{t('settings.stocksMarketUSHint')}</div>
          </div>
          <ToggleSwitch
            checked={stocksSettings.marketUS}
            label={t('settings.stocksMarketUS')}
            onChange={(marketUS) => patchStocks({ marketUS })}
          />
        </div>

        <div className={styles.settingRow}>
          <div>
            <div className={styles.settingTitle}>{t('settings.stocksAutoGenerate')}</div>
            <div className={styles.settingHint}>{t('settings.stocksAutoGenerateHint')}</div>
          </div>
          <ToggleSwitch
            checked={stocksSettings.autoGenerate}
            label={t('settings.stocksAutoGenerate')}
            onChange={(autoGenerate) => patchStocks({ autoGenerate })}
          />
        </div>

        <div className={styles.settingRow}>
          <div>
            <div className={styles.settingTitle}>{t('settings.stocksAutoHour')}</div>
            <div className={styles.settingHint}>{t('settings.stocksAutoHourHint')}</div>
          </div>
          <input
            className={styles.numberInput}
            type="number"
            min={0}
            max={23}
            value={stocksSettings.autoGenerateHour}
            onChange={(e) => patchStocks({ autoGenerateHour: Number(e.target.value) })}
          />
        </div>

        <div className={styles.settingRow}>
          <div>
            <div className={styles.settingTitle}>{t('settings.stocksScannerMax')}</div>
            <div className={styles.settingHint}>{t('settings.stocksScannerMaxHint')}</div>
          </div>
          <input
            className={styles.numberInput}
            type="number"
            min={1}
            max={100}
            value={stocksSettings.scannerMax}
            onChange={(e) => patchStocks({ scannerMax: Number(e.target.value) })}
          />
        </div>

        <div className={styles.settingRow}>
          <div>
            <div className={styles.settingTitle}>{t('settings.stocksMaxRecs')}</div>
            <div className={styles.settingHint}>{t('settings.stocksMaxRecsHint')}</div>
          </div>
          <input
            className={styles.numberInput}
            type="number"
            min={1}
            max={50}
            value={stocksSettings.maxRecommendations}
            onChange={(e) => patchStocks({ maxRecommendations: Number(e.target.value) })}
          />
        </div>

        <div className={styles.rangeSetting}>
          <div>
            <div className={styles.settingTitle}>{t('settings.stocksRanges')}</div>
            <div className={styles.settingHint}>{t('settings.stocksRangesHint')}</div>
          </div>
          <div className={styles.rangeChips}>
            {ALL_STOCKS_RANGE_KEYS.map((key) => {
              const active = stocksSettings.defaultRanges.includes(key)
              return (
                <button
                  key={key}
                  type="button"
                  className={`${styles.rangeChip} ${active ? styles.rangeChipActive : ''}`}
                  onClick={() => onToggleRange(key)}
                >
                  {t(`stocks.range.${key}`)}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className={styles.group} hidden={section !== 'skills'}>
        <h2 className={styles.label}>{t('settings.skills')}</h2>
        <p className={styles.desc}>{t('settings.skillsDesc')}</p>

        <div className={styles.faceBlock}>
          <div className={styles.settingTitle}>{t('settings.skillsInstall')}</div>
          <div className={styles.settingHint}>{t('settings.skillsInstallHint')}</div>
          <div className={styles.skillInstallRow}>
            <input
              className={styles.aiInput}
              value={skillInstallRef}
              onChange={(e) => setSkillInstallRef(e.target.value)}
              placeholder={t('settings.skillsInstallPlaceholder')}
              disabled={skillBusy}
            />
            <SettingActionButton
              icon={<IconDownload />}
              label={skillBusy ? t('settings.skillsInstalling') : t('settings.skillsInstallAction')}
              variant="primary"
              disabled={skillBusy || !skillInstallRef.trim()}
              onClick={() => {
                setSkillHint(null)
                setSkillBusy(true)
                void window.treasureChest
                  .installSkillFromGithub(skillInstallRef.trim())
                  .then(async () => {
                    setSkillInstallRef('')
                    await refreshSkills()
                    setSkillHint(t('settings.skillsInstallOk'))
                  })
                  .catch((err) => {
                    setSkillHint(
                      t('settings.skillsInstallFailed', {
                        error: err instanceof Error ? err.message : String(err),
                      }),
                    )
                  })
                  .finally(() => setSkillBusy(false))
              }}
            />
          </div>
        </div>

        {skillCatalogs.length > 0 ? (
          <div className={styles.faceBlock}>
            <div className={styles.settingTitle}>{t('settings.skillsCatalogs')}</div>
            <div className={styles.settingHint}>{t('settings.skillsCatalogsHint')}</div>
            <div className={styles.skillCatalogList}>
              {skillCatalogs.map((c) => (
                <a
                  key={c.id}
                  className={styles.skillCatalogCard}
                  href={c.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <strong>{c.name}</strong>
                  <span>{c.hint}</span>
                </a>
              ))}
            </div>
          </div>
        ) : null}

        <div className={styles.faceBlock}>
          <div className={styles.settingTitleRow}>
            <span>{t('settings.skillsInstalled')}</span>
            <span className={styles.skillCount}>
              {t('settings.skillsCount', { count: skills.length })}
            </span>
          </div>
          <div className={styles.settingHint}>{t('settings.skillsInstalledHint')}</div>
          {skills.length === 0 ? (
            <p className={styles.hint}>{t('settings.skillsEmpty')}</p>
          ) : (
            <ul className={styles.skillList}>
              {skills.map((skill) => {
                const builtin = skill.source === 'builtin'
                return (
                  <li key={skill.id} className={styles.skillItem}>
                    <div className={styles.skillItemMain}>
                      <div className={styles.skillItemHead}>
                        <strong>{skill.name}</strong>
                        <span
                          className={`${styles.skillBadge} ${
                            builtin ? styles.skillBadgeBuiltin : styles.skillBadgeCustom
                          }`}
                        >
                          {t(`settings.skillsSource.${skill.source}` as 'settings.skillsSource.builtin')}
                        </span>
                      </div>
                      {skill.description ? (
                        <p className={styles.skillItemDesc}>{skill.description}</p>
                      ) : null}
                      {skill.sourceRef ? (
                        <p className={styles.skillItemRef}>{skill.sourceRef}</p>
                      ) : null}
                    </div>
                    {!builtin ? (
                      <button
                        type="button"
                        className={styles.skillUninstall}
                        disabled={skillBusy}
                        title={t('settings.skillsUninstall')}
                        aria-label={t('settings.skillsUninstall')}
                        onClick={() => {
                          setSkillHint(null)
                          setSkillBusy(true)
                          void window.treasureChest
                            .uninstallSkill(skill.id)
                            .then(async (ok) => {
                              if (!ok) {
                                setSkillHint(t('settings.skillsUninstallFailed'))
                                return
                              }
                              await refreshSkills()
                              setSkillHint(t('settings.skillsUninstallOk'))
                            })
                            .catch((err) => {
                              setSkillHint(
                                t('settings.skillsUninstallFailedDetail', {
                                  error: err instanceof Error ? err.message : String(err),
                                }),
                              )
                            })
                            .finally(() => setSkillBusy(false))
                        }}
                      >
                        <IconTrash />
                      </button>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {skillHint ? <p className={styles.hint}>{skillHint}</p> : null}
      </div>

      <div className={styles.group} hidden={section !== 'mcp'}>
        <p className={styles.settingHint}>{t('settings.mcp.hint')}</p>
        {mcpServers.map((server, idx) => {
          const st = mcpStatusOf(server.id)
          const statusKey = st?.status ?? 'disconnected'
          return (
            <div key={server.id} className={styles.aiProviderRow}>
              <div className={styles.settingRow}>
                <div>
                  <div className={styles.settingTitle}>{server.name || t('settings.mcp.name')}</div>
                  <div className={styles.mcpStatusRow}>
                    <span className={`${styles.mcpBadge} ${styles[`mcpBadge_${statusKey}`] ?? ''}`}>
                      {t(`settings.mcp.status.${statusKey}`)}
                    </span>
                    {st?.error ? <span className={styles.mcpError}>{st.error}</span> : null}
                  </div>
                </div>
                <ToggleSwitch
                  label={t('settings.mcp.enabled')}
                  checked={server.enabled}
                  onChange={(enabled) => {
                    const next = mcpServers.map((s, i) => (i === idx ? { ...s, enabled } : s))
                    saveMcpServers(next)
                  }}
                />
              </div>
              <label className={styles.aiField}>
                <span className={styles.aiLabel}>{t('settings.mcp.name')}</span>
                <input
                  className={styles.aiInput}
                  value={server.name}
                  onChange={(e) => {
                    const next = mcpServers.map((s, i) =>
                      i === idx ? { ...s, name: e.target.value } : s,
                    )
                    setMcpServers(next)
                  }}
                  onBlur={() => saveMcpServers(mcpServers)}
                />
              </label>
              <label className={styles.aiField}>
                <span className={styles.aiLabel}>{t('settings.mcp.transport')}</span>
                <select
                  className={styles.aiInput}
                  value={server.transport}
                  onChange={(e) => {
                    const transport = (e.target.value === 'sse' ? 'sse' : 'stdio') as McpTransport
                    const next = mcpServers.map((s, i) => (i === idx ? { ...s, transport } : s))
                    saveMcpServers(next)
                  }}
                >
                  <option value="stdio">{t('settings.mcp.transport.stdio')}</option>
                  <option value="sse">{t('settings.mcp.transport.sse')}</option>
                </select>
              </label>
              {server.transport === 'sse' ? (
                <>
                  <label className={styles.aiField}>
                    <span className={styles.aiLabel}>{t('settings.mcp.url')}</span>
                    <input
                      className={styles.aiInput}
                      value={server.url}
                      placeholder="http://127.0.0.1:3000/sse"
                      onChange={(e) => {
                        const next = mcpServers.map((s, i) =>
                          i === idx ? { ...s, url: e.target.value } : s,
                        )
                        setMcpServers(next)
                      }}
                      onBlur={() => saveMcpServers(mcpServers)}
                    />
                  </label>
                  <div className={styles.mcpKvBlock}>
                    <div className={styles.aiLabel}>{t('settings.mcp.headers')}</div>
                    {server.headerPairs.map((pair, pIdx) => (
                      <div key={`h-${pIdx}`} className={styles.mcpKvRow}>
                        <input
                          className={styles.aiInput}
                          placeholder={t('settings.mcp.headerKey')}
                          value={pair.key}
                          onChange={(e) => {
                            const next = mcpServers.map((s, i) => {
                              if (i !== idx) return s
                              const headerPairs = s.headerPairs.map((p, j) =>
                                j === pIdx ? { ...p, key: e.target.value } : p,
                              )
                              return { ...s, headerPairs }
                            })
                            setMcpServers(next)
                          }}
                          onBlur={() => saveMcpServers(mcpServers)}
                        />
                        <input
                          className={styles.aiInput}
                          placeholder={t('settings.mcp.headerValue')}
                          value={pair.value}
                          onChange={(e) => {
                            const next = mcpServers.map((s, i) => {
                              if (i !== idx) return s
                              const headerPairs = s.headerPairs.map((p, j) =>
                                j === pIdx ? { ...p, value: e.target.value } : p,
                              )
                              return { ...s, headerPairs }
                            })
                            setMcpServers(next)
                          }}
                          onBlur={() => saveMcpServers(mcpServers)}
                        />
                        <button
                          type="button"
                          className={styles.aiProviderRemoveBtn}
                          onClick={() => {
                            const next = mcpServers.map((s, i) =>
                              i === idx
                                ? { ...s, headerPairs: s.headerPairs.filter((_, j) => j !== pIdx) }
                                : s,
                            )
                            saveMcpServers(next)
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className={styles.mcpAddKv}
                      onClick={() => {
                        const next = mcpServers.map((s, i) =>
                          i === idx
                            ? { ...s, headerPairs: [...s.headerPairs, { key: '', value: '' }] }
                            : s,
                        )
                        setMcpServers(next)
                      }}
                    >
                      {t('settings.mcp.headerAdd')}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <label className={styles.aiField}>
                    <span className={styles.aiLabel}>{t('settings.mcp.command')}</span>
                    <input
                      className={styles.aiInput}
                      value={server.command}
                      placeholder="npx"
                      onChange={(e) => {
                        const next = mcpServers.map((s, i) =>
                          i === idx ? { ...s, command: e.target.value } : s,
                        )
                        setMcpServers(next)
                      }}
                      onBlur={() => saveMcpServers(mcpServers)}
                    />
                  </label>
                  <label className={styles.aiField}>
                    <span className={styles.aiLabel}>{t('settings.mcp.args')}</span>
                    <input
                      className={styles.aiInput}
                      value={server.argsText}
                      placeholder="-y @modelcontextprotocol/server-filesystem /tmp"
                      onChange={(e) => {
                        const next = mcpServers.map((s, i) =>
                          i === idx ? { ...s, argsText: e.target.value } : s,
                        )
                        setMcpServers(next)
                      }}
                      onBlur={() => saveMcpServers(mcpServers)}
                    />
                  </label>
                  <div className={styles.mcpKvBlock}>
                    <div className={styles.aiLabel}>{t('settings.mcp.env')}</div>
                    <p className={styles.settingHint}>{t('settings.mcp.envHint')}</p>
                    {server.envPairs.map((pair, pIdx) => (
                      <div key={`e-${pIdx}`} className={styles.mcpKvRow}>
                        <input
                          className={styles.aiInput}
                          placeholder={t('settings.mcp.envKey')}
                          value={pair.key}
                          onChange={(e) => {
                            const next = mcpServers.map((s, i) => {
                              if (i !== idx) return s
                              const envPairs = s.envPairs.map((p, j) =>
                                j === pIdx ? { ...p, key: e.target.value } : p,
                              )
                              return { ...s, envPairs }
                            })
                            setMcpServers(next)
                          }}
                          onBlur={() => saveMcpServers(mcpServers)}
                        />
                        <input
                          className={styles.aiInput}
                          placeholder={t('settings.mcp.envValue')}
                          value={pair.value}
                          type="password"
                          onChange={(e) => {
                            const next = mcpServers.map((s, i) => {
                              if (i !== idx) return s
                              const envPairs = s.envPairs.map((p, j) =>
                                j === pIdx ? { ...p, value: e.target.value } : p,
                              )
                              return { ...s, envPairs }
                            })
                            setMcpServers(next)
                          }}
                          onBlur={() => saveMcpServers(mcpServers)}
                        />
                        <button
                          type="button"
                          className={styles.aiProviderRemoveBtn}
                          onClick={() => {
                            const next = mcpServers.map((s, i) =>
                              i === idx
                                ? { ...s, envPairs: s.envPairs.filter((_, j) => j !== pIdx) }
                                : s,
                            )
                            saveMcpServers(next)
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className={styles.mcpAddKv}
                      onClick={() => {
                        const next = mcpServers.map((s, i) =>
                          i === idx
                            ? { ...s, envPairs: [...s.envPairs, { key: '', value: '' }] }
                            : s,
                        )
                        setMcpServers(next)
                      }}
                    >
                      {t('settings.mcp.envAdd')}
                    </button>
                  </div>
                </>
              )}
              <div className={styles.mcpToolsBlock}>
                <div className={styles.aiLabel}>
                  {t('settings.mcp.toolsTitle')}
                  {st?.tools?.length ? ` (${st.tools.length})` : ''}
                </div>
                {st?.tools?.length ? (
                  <ul className={styles.mcpToolList}>
                    {st.tools.map((tool) => (
                      <li key={tool.name} title={tool.description || tool.name}>
                        <code>{tool.name}</code>
                        {tool.description ? (
                          <span className={styles.mcpToolDesc}>{tool.description}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.settingHint}>{t('settings.mcp.toolsEmpty')}</p>
                )}
              </div>
              <SettingActionButton
                icon={<IconEraser />}
                label={t('settings.mcp.remove')}
                variant="ghost"
                onClick={() => saveMcpServers(mcpServers.filter((_, i) => i !== idx))}
              />
            </div>
          )
        })}
        <div className={styles.aiActionRow}>
          <SettingActionButton
            icon={<IconUpload />}
            label={t('settings.mcp.add')}
            onClick={() => {
              const id = `mcp_${Date.now().toString(36)}`
              setMcpServers([
                ...mcpServers,
                {
                  id,
                  name: 'MCP Server',
                  enabled: true,
                  transport: 'stdio',
                  command: '',
                  argsText: '',
                  url: '',
                  envPairs: [],
                  headerPairs: [],
                },
              ])
            }}
          />
          <SettingActionButton
            icon={<IconLayers />}
            label={
              mcpRefreshing
                ? t('settings.mcp.refreshing')
                : t('settings.mcp.refreshTools', { count: mcpToolCount })
            }
            onClick={() => {
              setMcpRefreshing(true)
              void window.treasureChest
                .refreshMcpStatus()
                .then(applyMcpStatus)
                .finally(() => setMcpRefreshing(false))
            }}
          />
        </div>
      </div>

      <div className={styles.group} hidden={section !== 'notifications'}>
        <h2 className={styles.label}>{t('settings.notifications')}</h2>

        <div className={styles.settingRow}>
          <div>
            <div className={styles.settingTitle}>{t('settings.fortuneDailyNotify')}</div>
            <div className={styles.settingHint}>{t('settings.fortuneDailyNotifyHint')}</div>
          </div>
          <ToggleSwitch
            checked={fortuneDailyNotify}
            label={t('settings.fortuneDailyNotify')}
            onChange={onFortuneDailyNotify}
          />
        </div>

        <div className={styles.settingRow}>
          <div>
            <div className={styles.settingTitle}>{t('settings.fortuneNotifyHour')}</div>
            <div className={styles.settingHint}>{t('settings.fortuneNotifyHourHint')}</div>
          </div>
          <select
            className={styles.hourSelect}
            value={fortuneNotifyHour}
            disabled={!fortuneDailyNotify}
            onChange={(e) => onFortuneNotifyHour(Number(e.target.value))}
          >
            {Array.from({ length: 24 }, (_, hour) => (
              <option key={hour} value={hour}>
                {t('settings.fortuneNotifyHourOption', { hour: String(hour).padStart(2, '0') })}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.settingRow}>
          <div>
            <div className={styles.settingTitle}>{t('settings.stocksDailyNotify')}</div>
            <div className={styles.settingHint}>{t('settings.stocksDailyNotifyHint')}</div>
          </div>
          <ToggleSwitch
            checked={stocksDailyNotify}
            label={t('settings.stocksDailyNotify')}
            onChange={onStocksDailyNotify}
          />
        </div>
      </div>

      <div className={styles.group} hidden={section !== 'data'}>
        <h2 className={styles.label}>{t('settings.harness')}</h2>
        <p className={styles.desc}>{t('settings.harnessDesc')}</p>

        <label className={styles.aiField}>
          <span className={styles.aiLabel}>{t('settings.harnessSandbox')}</span>
          <input className={styles.aiInput} value={harnessSandboxRoot} readOnly />
        </label>
        <div className={styles.actionRow}>
          <SettingActionButton
            icon={<IconUpload />}
            label={t('settings.harnessSandboxBrowse')}
            variant="secondary"
            onClick={onPickHarnessSandbox}
          />
        </div>

        <label className={styles.aiField}>
          <span className={styles.aiLabel}>{t('settings.harnessPluginsDir')}</span>
          <input className={styles.aiInput} value={harnessPluginsDir} readOnly />
        </label>

        <label className={styles.aiField}>
          <span className={styles.aiLabel}>{t('settings.harnessCordisProfile')}</span>
          <input
            className={styles.aiInput}
            list="cordis-profile-options"
            value={cordisProfile}
            onChange={(e) => setCordisProfile(e.target.value)}
          />
          <datalist id="cordis-profile-options">
            {cordisProfileOptions.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </label>
        <div className={styles.actionRow}>
          <input
            className={styles.aiInput}
            value={newProfileDraft}
            onChange={(e) => setNewProfileDraft(e.target.value)}
            placeholder={t('settings.harnessNewProfilePlaceholder')}
          />
          <SettingActionButton
            icon={<IconPlus />}
            label={t('settings.harnessCreateProfile')}
            variant="secondary"
            onClick={() => {
              const id = newProfileDraft.trim()
              if (!id) return
              void window.treasureChest.harnessCreateCordisProfile({ profileId: id }).then((profileId) => {
                setNewProfileDraft('')
                setCordisProfile(profileId)
                setHarnessHint(t('settings.harnessProfileCreated', { id: profileId }))
                return window.treasureChest.harnessListCordisProfiles()
              }).then((profiles) => setCordisProfileOptions(profiles))
            }}
          />
        </div>
        <label className={styles.aiField}>
          <span className={styles.aiLabel}>{t('settings.harnessCordisBundles')}</span>
          <input
            className={styles.aiInput}
            value={cordisBundles}
            onChange={(e) => setCordisBundles(e.target.value)}
            placeholder="core-coding"
          />
        </label>
        <div className={styles.actionRow}>
          <input
            className={styles.aiInput}
            value={newBundleDraft}
            onChange={(e) => setNewBundleDraft(e.target.value)}
            placeholder={t('settings.harnessNewBundlePlaceholder')}
          />
          <SettingActionButton
            icon={<IconPlus />}
            label={t('settings.harnessCreateBundle')}
            variant="secondary"
            onClick={() => {
              const id = newBundleDraft.trim()
              if (!id) return
              void window.treasureChest.harnessCreateCordisBundle({ bundleId: id }).then((bundleId) => {
                setNewBundleDraft('')
                setCordisBundles((prev) => (prev.trim() ? `${prev}, ${bundleId}` : bundleId))
                setHarnessHint(t('settings.harnessBundleCreated', { id: bundleId }))
              })
            }}
          />
        </div>
        <label className={styles.aiField}>
          <span className={styles.aiLabel}>{t('settings.harnessSandboxMode')}</span>
          <select
            className={styles.aiInput}
            value={sandboxModeDraft}
            onChange={(e) => setSandboxModeDraft(e.target.value as 'local' | 'ssh' | 'container')}
          >
            <option value="local">{t('settings.harnessSandboxModeLocal')}</option>
            <option value="ssh">{t('settings.harnessSandboxModeSsh')}</option>
            <option value="container">{t('settings.harnessSandboxModeContainer')}</option>
          </select>
        </label>
        {sandboxModeDraft === 'ssh' ? (
          <>
            <label className={styles.aiField}>
              <span className={styles.aiLabel}>{t('settings.harnessSshHost')}</span>
              <input className={styles.aiInput} value={sshHostDraft} onChange={(e) => setSshHostDraft(e.target.value)} />
            </label>
            <label className={styles.aiField}>
              <span className={styles.aiLabel}>{t('settings.harnessSshUser')}</span>
              <input className={styles.aiInput} value={sshUserDraft} onChange={(e) => setSshUserDraft(e.target.value)} />
            </label>
            <label className={styles.aiField}>
              <span className={styles.aiLabel}>{t('settings.harnessSshRemotePath')}</span>
              <input className={styles.aiInput} value={sshPathDraft} onChange={(e) => setSshPathDraft(e.target.value)} />
            </label>
            <label className={styles.aiField}>
              <span className={styles.aiLabel}>{t('settings.harnessSshPort')}</span>
              <input className={styles.aiInput} value={sshPortDraft} onChange={(e) => setSshPortDraft(e.target.value)} />
            </label>
          </>
        ) : null}
        {sandboxModeDraft === 'container' ? (
          <>
            <label className={styles.aiField}>
              <span className={styles.aiLabel}>{t('settings.harnessContainerName')}</span>
              <input
                className={styles.aiInput}
                value={containerNameDraft}
                onChange={(e) => setContainerNameDraft(e.target.value)}
                placeholder="my-devcontainer"
              />
            </label>
            <label className={styles.aiField}>
              <span className={styles.aiLabel}>{t('settings.harnessContainerWorkspace')}</span>
              <input
                className={styles.aiInput}
                value={containerWorkspaceDraft}
                onChange={(e) => setContainerWorkspaceDraft(e.target.value)}
                placeholder="/workspace"
              />
            </label>
            <p className={styles.desc}>{t('settings.harnessContainerHint')}</p>
          </>
        ) : null}
        <label className={styles.aiField}>
          <span className={styles.aiLabel}>{t('settings.harnessSandboxBackend')}</span>
          <input className={styles.aiInput} value={sandboxBackend} readOnly />
        </label>
        <ToggleSwitch
          checked={embeddedDshDraft}
          label={t('settings.harnessEmbeddedDshWeb')}
          onChange={(next) => {
            setEmbeddedDshDraft(next)
            void window.treasureChest.harnessSetEmbeddedDshWebPreferred(next).then(() => {
              if (next) {
                void window.treasureChest.harnessGetDshWebUrl().then(setDshWebDraft)
              }
              setHarnessHint(t('settings.harnessEmbeddedDshWebSaved'))
            })
          }}
        />
        <label className={styles.aiField}>
          <span className={styles.aiLabel}>{t('settings.harnessDshWebUrl')}</span>
          <input
            className={styles.aiInput}
            value={dshWebDraft}
            onChange={(e) => setDshWebDraft(e.target.value)}
            disabled={embeddedDshDraft}
          />
        </label>
        <div className={styles.actionRow}>
          <SettingActionButton
            icon={<IconUpload />}
            label={t('settings.harnessSaveCordis')}
            variant="secondary"
            onClick={() => {
              void window.treasureChest
                .harnessSaveCordisSettings({
                  profileId: cordisProfile.trim(),
                  bundleIds: cordisBundles
                    .split(',')
                    .map((b) => b.trim())
                    .filter(Boolean),
                  dshWebUrl: dshWebDraft.trim(),
                  sandboxMode: sandboxModeDraft,
                  sshHost: sshHostDraft.trim(),
                  sshUser: sshUserDraft.trim(),
                  sshRemotePath: sshPathDraft.trim() || '.',
                  sshPort: sshPortDraft.trim() ? Number(sshPortDraft) : undefined,
                  containerName: containerNameDraft.trim(),
                  containerWorkspacePath: containerWorkspaceDraft.trim() || '/workspace',
                })
                .then((stack) => {
                  setCordisProfile(stack.profileId)
                  setCordisBundles(stack.bundleIds.join(', '))
                  setSandboxModeDraft(stack.sandboxMode)
                  setContainerNameDraft(stack.container?.containerName ?? '')
                  setContainerWorkspaceDraft(stack.container?.workspacePath ?? '/workspace')
                  setHarnessHint(t('settings.harnessCordisSaved'))
                  return window.treasureChest.harnessGetSandboxBackend()
                })
                .then((backend) => setSandboxBackend(`${backend.mode}: ${backend.label}`))
            }}
          />
          <SettingActionButton
            icon={<IconUpload />}
            label={t('settings.harnessDshWebSave')}
            variant="secondary"
            onClick={() => {
              void window.treasureChest.harnessSetDshWebUrl(dshWebDraft.trim()).then((url) => {
                setDshWebDraft(url)
                setHarnessHint(t('settings.harnessDshWebSaved'))
              })
            }}
          />
          <SettingActionButton
            icon={<IconUpload />}
            label={t('settings.harnessReloadCordis')}
            variant="secondary"
            onClick={() => {
              void window.treasureChest.harnessReloadCordisStack().then((stack) => {
                setCordisProfile(stack.profileId)
                setCordisBundles(stack.bundleIds.join(', '))
                setHarnessHint(t('settings.harnessCordisReloaded'))
              })
            }}
          />
          <SettingActionButton
            icon={<IconUpload />}
            label={t('settings.harnessOpenCordisRoot')}
            variant="secondary"
            onClick={() => void window.treasureChest.harnessOpenCordisRoot()}
          />
        </div>

        <HarnessPluginMarketplace onHint={setHarnessHint} />
        {harnessHint ? <p className={styles.hint}>{harnessHint}</p> : null}
      </div>

      <div className={styles.group} hidden={section !== 'data'}>
        <h2 className={styles.label}>{t('settings.backup')}</h2>
        <p className={styles.desc}>{t('settings.backupDesc')}</p>
        <ul className={styles.backupList}>
          <li>{t('settings.backupIncludes')}</li>
          <li>{t('settings.backupExcludes')}</li>
        </ul>
        <div className={styles.actionRow}>
          <SettingActionButton
            icon={<IconDownload />}
            label={t('settings.exportBackup')}
            variant="primary"
            onClick={onExportBackup}
          />
          <SettingActionButton
            icon={<IconUpload />}
            label={t('settings.importBackup')}
            variant="secondary"
            onClick={onImportBackup}
          />
        </div>
        {backupMsg ? <p className={styles.hint}>{backupMsg}</p> : null}
      </div>
      </section>
    </div>
  )
}

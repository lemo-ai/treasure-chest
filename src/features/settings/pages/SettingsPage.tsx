import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  AppLocale,
  DesktopWidgetView,
  DialFaceStyle,
  FortuneAiProviderConfig,
  HexagramSchool,
  LaunchBehavior,
  StocksRangeKey,
  StocksSettings,
  ThemeMode,
} from '@shared'
import {
  ALL_STOCKS_RANGE_KEYS,
  DEFAULT_DESKTOP_WIDGET,
  DEFAULT_FORTUNE_SETTINGS,
  DEFAULT_NOTIFICATION_SETTINGS,
  DEFAULT_STOCKS_SETTINGS,
  DIAL_FACE_STYLES,
  HEXAGRAM_SCHOOLS,
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
  IconFlower,
  IconGlobe,
  IconImage,
  IconKey,
  IconLayers,
  IconMonitor,
  IconMoon,
  IconSettings,
  IconStocks,
  IconSun,
  IconTrash,
  IconTray,
  IconUpload,
  IconSparkles,
  IconYinYang,
} from '@renderer/shared/ui/icons'
import styles from './SettingsPage.module.css'

const themes: ThemeMode[] = ['light', 'dark', 'system']
const locales: AppLocale[] = ['zh-CN', 'en-US']
const launchBehaviors: LaunchBehavior[] = ['main', 'tray', 'widget']
const hexagramSchools: HexagramSchool[] = HEXAGRAM_SCHOOLS

const themeMeta = {
  light: { icon: <IconSun />, tone: 'highlight' as const },
  dark: { icon: <IconMoon />, tone: 'accent' as const },
  system: { icon: <IconMonitor />, tone: 'brand' as const },
}

const launchBehaviorMeta = {
  main: { icon: <IconMonitor />, tone: 'brand' as const },
  tray: { icon: <IconTray />, tone: 'accent' as const },
  widget: { icon: <IconDial />, tone: 'highlight' as const },
}

const hexagramSchoolMeta = {
  daymaster: { icon: <IconYinYang />, tone: 'brand' as const },
  meihua: { icon: <IconFlower />, tone: 'highlight' as const },
  liuyao: { icon: <IconLayers />, tone: 'accent' as const },
}

const localeMeta = {
  'zh-CN': { icon: <IconGlobe />, tone: 'brand' as const },
  'en-US': { icon: <IconGlobe />, tone: 'accent' as const },
}

export function SettingsPage(): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const { theme, setTheme } = useTheme()
  const [widget, setWidget] = useState<DesktopWidgetView>({
    ...DEFAULT_DESKTOP_WIDGET,
    backgroundImageUrl: null,
    backgroundHistory: [],
  })
  const [launchAtLogin, setLaunchAtLogin] = useState(false)
  const [launchBehavior, setLaunchBehavior] = useState<LaunchBehavior>('main')
  const [fortuneDailyNotify, setFortuneDailyNotify] = useState(DEFAULT_NOTIFICATION_SETTINGS.fortuneDaily)
  const [stocksDailyNotify, setStocksDailyNotify] = useState(DEFAULT_NOTIFICATION_SETTINGS.stocksDaily)
  const [stocksSettings, setStocksSettings] = useState<StocksSettings>({ ...DEFAULT_STOCKS_SETTINGS })
  const [hexagramSchool, setHexagramSchool] = useState<HexagramSchool>(DEFAULT_FORTUNE_SETTINGS.hexagramSchool)
  const [fortuneAiPolish, setFortuneAiPolish] = useState(DEFAULT_FORTUNE_SETTINGS.aiPolish)
  const [aiProviders, setAiProviders] = useState<FortuneAiProviderConfig[]>(DEFAULT_FORTUNE_SETTINGS.aiProviders)
  const [aiActiveProviderId, setAiActiveProviderId] = useState(DEFAULT_FORTUNE_SETTINGS.aiActiveProviderId)
  const [aiProviderName, setAiProviderName] = useState(DEFAULT_FORTUNE_SETTINGS.aiProviderName)
  const [aiBaseUrl, setAiBaseUrl] = useState(DEFAULT_FORTUNE_SETTINGS.aiBaseUrl)
  const [aiApiFormat, setAiApiFormat] = useState(DEFAULT_FORTUNE_SETTINGS.aiApiFormat)
  const [aiModels, setAiModels] = useState<string[]>(DEFAULT_FORTUNE_SETTINGS.aiModels)
  const [aiModel, setAiModel] = useState(DEFAULT_FORTUNE_SETTINGS.aiModel)
  const [aiModelDraft, setAiModelDraft] = useState('')
  const [aiApiKey, setAiApiKey] = useState(DEFAULT_FORTUNE_SETTINGS.aiApiKey)
  const [aiSavedHint, setAiSavedHint] = useState<string | null>(null)
  const [aiTesting, setAiTesting] = useState(false)
  const [aiTestHint, setAiTestHint] = useState<string | null>(null)
  const [backupMsg, setBackupMsg] = useState<string | null>(null)

  type SettingsSection = 'general' | 'display' | 'models' | 'fortune' | 'stocks' | 'notifications' | 'data'
  const [section, setSection] = useState<SettingsSection>('models')

  const navItems: { id: SettingsSection; labelKey: string; icon: ReactNode }[] = [
    { id: 'general', labelKey: 'settings.nav.general', icon: <IconSettings /> },
    { id: 'display', labelKey: 'settings.nav.display', icon: <IconMonitor /> },
    { id: 'models', labelKey: 'settings.nav.models', icon: <IconKey /> },
    { id: 'fortune', labelKey: 'settings.nav.fortune', icon: <IconSparkles /> },
    { id: 'stocks', labelKey: 'settings.nav.stocks', icon: <IconStocks /> },
    { id: 'notifications', labelKey: 'settings.nav.notifications', icon: <IconBell /> },
    { id: 'data', labelKey: 'settings.nav.data', icon: <IconDownload /> },
  ]

  useEffect(() => {
    void window.treasureChest.getDesktopWidget().then(setWidget)
    void window.treasureChest.getSettingsSnapshot().then((snap) => {
      setLaunchBehavior(snap.launchBehavior)
      setFortuneDailyNotify(snap.notifications?.fortuneDaily ?? DEFAULT_NOTIFICATION_SETTINGS.fortuneDaily)
      setStocksDailyNotify(snap.notifications?.stocksDaily ?? DEFAULT_NOTIFICATION_SETTINGS.stocksDaily)
      setStocksSettings(snap.stocks ?? DEFAULT_STOCKS_SETTINGS)
      setHexagramSchool(snap.fortune?.hexagramSchool ?? DEFAULT_FORTUNE_SETTINGS.hexagramSchool)
      setFortuneAiPolish(snap.fortune?.aiPolish ?? DEFAULT_FORTUNE_SETTINGS.aiPolish)
      setAiProviders(snap.fortune?.aiProviders ?? DEFAULT_FORTUNE_SETTINGS.aiProviders)
      setAiActiveProviderId(snap.fortune?.aiActiveProviderId ?? DEFAULT_FORTUNE_SETTINGS.aiActiveProviderId)
      setAiProviderName(snap.fortune?.aiProviderName ?? DEFAULT_FORTUNE_SETTINGS.aiProviderName)
      setAiBaseUrl(snap.fortune?.aiBaseUrl ?? DEFAULT_FORTUNE_SETTINGS.aiBaseUrl)
      setAiApiFormat(snap.fortune?.aiApiFormat ?? DEFAULT_FORTUNE_SETTINGS.aiApiFormat)
      setAiModels(snap.fortune?.aiModels ?? DEFAULT_FORTUNE_SETTINGS.aiModels)
      setAiModel(snap.fortune?.aiModel ?? DEFAULT_FORTUNE_SETTINGS.aiModel)
      setAiApiKey(snap.fortune?.aiApiKey ?? DEFAULT_FORTUNE_SETTINGS.aiApiKey)
    })
    void window.treasureChest.getLaunchAtLogin().then((state) => {
      setLaunchAtLogin(state.configured)
    })
  }, [])

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
        setStocksSettings(snap.stocks ?? DEFAULT_STOCKS_SETTINGS)
        setHexagramSchool(snap.fortune?.hexagramSchool ?? DEFAULT_FORTUNE_SETTINGS.hexagramSchool)
        setFortuneAiPolish(snap.fortune?.aiPolish ?? DEFAULT_FORTUNE_SETTINGS.aiPolish)
        setAiProviders(snap.fortune?.aiProviders ?? DEFAULT_FORTUNE_SETTINGS.aiProviders)
        setAiActiveProviderId(snap.fortune?.aiActiveProviderId ?? DEFAULT_FORTUNE_SETTINGS.aiActiveProviderId)
        setAiProviderName(snap.fortune?.aiProviderName ?? DEFAULT_FORTUNE_SETTINGS.aiProviderName)
        setAiBaseUrl(snap.fortune?.aiBaseUrl ?? DEFAULT_FORTUNE_SETTINGS.aiBaseUrl)
        setAiApiFormat(snap.fortune?.aiApiFormat ?? DEFAULT_FORTUNE_SETTINGS.aiApiFormat)
        setAiModels(snap.fortune?.aiModels ?? DEFAULT_FORTUNE_SETTINGS.aiModels)
        setAiModel(snap.fortune?.aiModel ?? DEFAULT_FORTUNE_SETTINGS.aiModel)
        setAiApiKey(snap.fortune?.aiApiKey ?? DEFAULT_FORTUNE_SETTINGS.aiApiKey)
        const login = await window.treasureChest.getLaunchAtLogin()
        setLaunchAtLogin(login.configured)
        const w = await window.treasureChest.getDesktopWidget()
        setWidget(w)
      } else if (result.error) {
        setBackupMsg(t('settings.backupFailed', { error: result.error }))
      }
    })
  }

  const onSaveAiConfig = (): void => {
    setAiSavedHint(null)
    const normalizedModels = Array.from(new Set(aiModels.map((m) => m.trim()).filter(Boolean)))
    const resolvedModels =
      normalizedModels.length > 0
        ? normalizedModels
        : aiModel.trim()
          ? [aiModel.trim()]
          : []
    const resolvedModel = resolvedModels.includes(aiModel.trim())
      ? aiModel.trim()
      : (resolvedModels[0] ?? '')
    const nextProviders = aiProviders.map((provider) =>
      provider.id === aiActiveProviderId
        ? {
            ...provider,
            name: aiProviderName.trim() || provider.name,
            baseUrl: aiBaseUrl.trim() || provider.baseUrl,
            apiFormat: aiApiFormat,
            models: resolvedModels,
            apiKey: aiApiKey.trim(),
          }
        : provider,
    )

    void window.treasureChest
      .setFortuneSettings({
        aiProviderName: aiProviderName.trim(),
        aiBaseUrl: aiBaseUrl.trim(),
        aiApiFormat,
        aiModels: resolvedModels,
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
        setAiModels(next.aiModels)
        setAiModel(next.aiModel)
        setAiApiKey(next.aiApiKey)
        setAiSavedHint(t('settings.fortuneAiConfigSaved'))
      })
  }

  const onTestAiConnection = (): void => {
    const resolvedModels = Array.from(new Set(aiModels.map((m) => m.trim()).filter(Boolean)))
    const model = aiModel.trim() || resolvedModels[0] || ''
    if (!model) {
      setAiTestHint(t('settings.fortuneAiNeedModel'))
      return
    }
    const provider: FortuneAiProviderConfig = {
      id: aiActiveProviderId || 'temp-provider',
      name: aiProviderName.trim() || 'Provider',
      baseUrl: aiBaseUrl.trim(),
      apiFormat: aiApiFormat,
      models: resolvedModels.length > 0 ? resolvedModels : [model],
      apiKey: aiApiKey.trim(),
    }
    setAiTesting(true)
    setAiTestHint(t('settings.fortuneAiTesting'))
    void window.treasureChest.testFortuneAiConnection({ provider, model }).then((res) => {
      setAiTesting(false)
      setAiTestHint(res.ok ? t('settings.fortuneAiTestPassed', { message: res.message }) : t('settings.fortuneAiTestFailed', { error: res.message }))
    })
  }

  const onAddAiModel = (): void => {
    const next = aiModelDraft.trim()
    if (!next) return
    setAiModels((prev) => (prev.includes(next) ? prev : [...prev, next]))
    setAiModel(next)
    setAiModelDraft('')
  }

  const onRemoveAiModel = (model: string): void => {
    setAiModels((prev) => {
      const next = prev.filter((m) => m !== model)
      if (next.length > 0 && aiModel === model) {
        setAiModel(next[0]!)
      }
      if (next.length === 0) {
        setAiModel('')
      }
      return next
    })
  }

  const onSelectProvider = (id: string): void => {
    const provider = aiProviders.find((p) => p.id === id)
    if (!provider) return
    setAiActiveProviderId(provider.id)
    setAiProviderName(provider.name)
    setAiBaseUrl(provider.baseUrl)
    setAiApiFormat(provider.apiFormat)
    setAiModels(provider.models)
    setAiModel(provider.models[0] ?? '')
    setAiApiKey(provider.apiKey)
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
    }
    const nextProviders = [...aiProviders, next]
    setAiProviders(nextProviders)
    setAiActiveProviderId(next.id)
    setAiProviderName(next.name)
    setAiBaseUrl(next.baseUrl)
    setAiApiFormat(next.apiFormat)
    setAiModels(next.models)
    setAiModel(next.models[0] ?? '')
    setAiApiKey(next.apiKey)
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
      setAiModels(first.models)
      setAiModel(first.models[0] ?? '')
      setAiApiKey(first.apiKey)
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
          <div className={styles.settingTitle}>{t('settings.desktopWidget.dialFace')}</div>
          <div className={styles.settingHint}>{t('settings.desktopWidget.dialFaceHint')}</div>
          <div className={styles.faceGrid}>
            {DIAL_FACE_STYLES.map((face) => {
              const previewClass = {
                teal: styles.face_teal,
                ink: styles.face_ink,
                dawn: styles.face_dawn,
                minimal: styles.face_minimal,
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
      </div>

      <div className={styles.group} hidden={section !== 'fortune'}>
        <h2 className={styles.label}>{t('settings.fortune')}</h2>

        <div className={styles.faceBlock}>
          <div className={styles.settingTitle}>{t('settings.hexagramSchool')}</div>
          <div className={styles.settingHint}>{t('settings.hexagramSchoolHint')}</div>
          <div className={styles.optionGrid}>
            {hexagramSchools.map((school) => (
              <SettingOption
                key={school}
                icon={hexagramSchoolMeta[school].icon}
                tone={hexagramSchoolMeta[school].tone}
                label={t(`settings.hexagramSchool.${school}`)}
                active={hexagramSchool === school}
                onClick={() => onHexagramSchool(school)}
              />
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
              placeholder="https://api.example.com/v1"
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
        </div>
        <div className={styles.aiModelBlock}>
          <div className={styles.aiLabel}>{t('settings.fortuneAiModelList')}</div>
          <div className={styles.aiModelAddRow}>
            <input
              className={styles.aiInput}
              value={aiModelDraft}
              onChange={(e) => setAiModelDraft(e.target.value)}
              placeholder={t('settings.fortuneAiModelPlaceholder')}
            />
            <button type="button" className={styles.aiAddBtn} onClick={onAddAiModel}>
              + {t('settings.fortuneAiModelAdd')}
            </button>
          </div>
          <div className={styles.aiModelChips}>
            {aiModels.map((model) => (
              <div
                key={model}
                className={`${styles.aiModelChip} ${aiModel === model ? styles.aiModelChipActive : ''}`}
              >
                <button type="button" className={styles.aiModelPickBtn} onClick={() => setAiModel(model)}>
                  {model}
                </button>
                <button type="button" className={styles.aiModelRemoveBtn} onClick={() => onRemoveAiModel(model)}>
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
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

      <div className={styles.group} hidden={section !== 'display'}>
        <h2 className={styles.label}>{t('settings.theme')}</h2>
        <div className={styles.optionGrid}>
          {themes.map((mode) => (
            <SettingOption
              key={mode}
              icon={themeMeta[mode].icon}
              tone={themeMeta[mode].tone}
              label={t(`settings.theme.${mode}`)}
              description={t(`settings.themeHint.${mode}`)}
              active={theme === mode}
              onClick={() => void setTheme(mode)}
            />
          ))}
        </div>
      </div>

      <div className={styles.group} hidden={section !== 'general'}>
        <h2 className={styles.label}>{t('settings.language')}</h2>
        <div className={styles.optionGrid}>
          {locales.map((locale) => (
            <SettingOption
              key={locale}
              icon={localeMeta[locale].icon}
              tone={localeMeta[locale].tone}
              label={t(`settings.locale.${locale}`)}
              description={t(`settings.localeHint.${locale}`)}
              active={i18n.language === locale}
              onClick={() => void onLocale(locale)}
            />
          ))}
        </div>
      </div>

      <div className={styles.group} hidden={section !== 'data'}>
        <h2 className={styles.label}>{t('settings.backup')}</h2>
        <p className={styles.desc}>{t('settings.backupDesc')}</p>
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

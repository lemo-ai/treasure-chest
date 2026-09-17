import { useEffect, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import type {
  AppLocale,
  DataSourceConfig,
  DesktopWidgetView,
  DialFaceStyle,
  HexagramSchool,
  LaunchBehavior,
  NotificationChannels,
  StocksRangeKey,
  StocksSettings,
  ThemeMode,
} from '@shared'
import {
  ALL_STOCKS_RANGE_KEYS,
  DEFAULT_DESKTOP_WIDGET,
  DEFAULT_FORTUNE_SETTINGS,
  DEFAULT_NOTIFICATION_CHANNELS,
  DEFAULT_STOCKS_SETTINGS,
  DIAL_FACE_STYLES,
  HEXAGRAM_SCHOOLS,
  THEME_ACCENTS,
} from '@shared'
import { setAppLocale } from '@renderer/shared/lib/i18n'
import { useTheme } from '@renderer/shared/hooks/useTheme'
import { SettingActionButton } from '@renderer/shared/ui/SettingActionButton'
import { SettingOption } from '@renderer/shared/ui/SettingOption'
import { ToggleSwitch } from '@renderer/shared/ui/ToggleSwitch'
import {
  IconBell,
  IconBug,
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
  IconWorkbench,
} from '@renderer/shared/ui/icons'
import { BirthProfileForm } from '@renderer/features/fortune/components/BirthProfileForm'
import { HarnessPluginMarketplace } from '../components/HarnessPluginMarketplace'
import { DataSourcesPanel } from '../components/DataSourcesPanel'
import { AgentsPanel } from '../components/AgentsPanel'
import { McpServersPanel } from '../components/McpServersPanel'
import { ModelsApiPanel } from '../components/ModelsApiPanel'
import { ImageEnginesPanel } from '../components/ImageEnginesPanel'
import { LibreOfficePanel } from '../components/LibreOfficePanel'
import { DebugPanel } from '../components/DebugPanel'
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
  const [notifyChannels, setNotifyChannels] = useState<NotificationChannels>(DEFAULT_NOTIFICATION_CHANNELS)
  const [channelTestMsg, setChannelTestMsg] = useState<string | null>(null)
  const [dataSources, setDataSources] = useState<DataSourceConfig[]>([])
  const [modelsRefreshKey, setModelsRefreshKey] = useState(0)
  const [stocksSettings, setStocksSettings] = useState<StocksSettings>({ ...DEFAULT_STOCKS_SETTINGS })
  const [hexagramSchool, setHexagramSchool] = useState<HexagramSchool>(DEFAULT_FORTUNE_SETTINGS.hexagramSchool)
  const [fortuneAiPolish, setFortuneAiPolish] = useState(DEFAULT_FORTUNE_SETTINGS.aiPolish)
  const [backupMsg, setBackupMsg] = useState<string | null>(null)
  const [harnessSandboxRoot, setHarnessSandboxRoot] = useState('')
  const [harnessPluginsDir, setHarnessPluginsDir] = useState('')
  const [visionModelsRoot, setVisionModelsRoot] = useState('')
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
    | 'image'
    | 'fortune'
    | 'stocks'
    | 'agents'
    | 'skills'
    | 'mcp'
    | 'notifications'
    | 'dataSources'
    | 'data'
    | 'debug'
  const [section, setSection] = useState<SettingsSection>('general')

  const navItems: { id: SettingsSection; labelKey: string; icon: ReactNode }[] = [
    { id: 'general', labelKey: 'settings.nav.general', icon: <IconSettings /> },
    { id: 'display', labelKey: 'settings.nav.display', icon: <IconMonitor /> },
    { id: 'models', labelKey: 'settings.nav.models', icon: <IconKey /> },
    { id: 'image', labelKey: 'settings.nav.image', icon: <IconImage /> },
    { id: 'fortune', labelKey: 'settings.nav.fortune', icon: <IconSparkles /> },
    { id: 'stocks', labelKey: 'settings.nav.stocks', icon: <IconStocks /> },
    { id: 'agents', labelKey: 'settings.nav.agents', icon: <IconWorkbench /> },
    { id: 'skills', labelKey: 'settings.nav.skills', icon: <IconSkill /> },
    { id: 'mcp', labelKey: 'settings.nav.mcp', icon: <IconLayers /> },
    { id: 'notifications', labelKey: 'settings.nav.notifications', icon: <IconBell /> },
    { id: 'dataSources', labelKey: 'settings.nav.dataSources', icon: <IconUpload /> },
    { id: 'data', labelKey: 'settings.nav.data', icon: <IconDownload /> },
    { id: 'debug', labelKey: 'settings.nav.debug', icon: <IconBug /> },
  ]

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
      window.treasureChest.getImageToolsSettings(),
    ]).then(([sandbox, plugins, stack, backend, dshUrl, embeddedDsh, profiles, imageTools]) => {
      setHarnessSandboxRoot(sandbox)
      setHarnessPluginsDir(plugins)
      setVisionModelsRoot(imageTools.resolvedModelsRoot ?? '')
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
      setNotifyChannels(snap.notifications?.channels ?? DEFAULT_NOTIFICATION_CHANNELS)
      setDataSources(snap.dataSources?.sources ?? [])
      setStocksSettings(snap.stocks ?? DEFAULT_STOCKS_SETTINGS)
      setHexagramSchool(snap.fortune?.hexagramSchool ?? DEFAULT_FORTUNE_SETTINGS.hexagramSchool)
      setFortuneAiPolish(snap.fortune?.aiPolish ?? DEFAULT_FORTUNE_SETTINGS.aiPolish)
    })
    void window.treasureChest.getLaunchAtLogin().then((state) => {
      setLaunchAtLogin(state.configured)
    })
  }, [])

  useEffect(() => {
    const raw = new URLSearchParams(location.search).get('section')
    const allowed: SettingsSection[] = [
      'general',
      'display',
      'models',
      'image',
      'fortune',
      'stocks',
      'agents',
      'skills',
      'mcp',
      'notifications',
      'dataSources',
      'data',
      'debug',
    ]
    if (raw && (allowed as string[]).includes(raw)) {
      setSection(raw as SettingsSection)
    }
  }, [location.search])

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

  const patchNotifyChannels = (partial: Partial<NotificationChannels>): void => {
    const nextChannels: NotificationChannels = {
      ...notifyChannels,
      ...partial,
      dingtalk: { ...notifyChannels.dingtalk, ...(partial.dingtalk ?? {}) },
      email: { ...notifyChannels.email, ...(partial.email ?? {}) },
    }
    setNotifyChannels(nextChannels)
    void window.treasureChest.setNotifications({ channels: nextChannels }).then((next) => {
      setNotifyChannels(next.channels)
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
        setNotifyChannels(snap.notifications?.channels ?? DEFAULT_NOTIFICATION_CHANNELS)
        setDataSources(snap.dataSources?.sources ?? [])
        setStocksSettings(snap.stocks ?? DEFAULT_STOCKS_SETTINGS)
        setHexagramSchool(snap.fortune?.hexagramSchool ?? DEFAULT_FORTUNE_SETTINGS.hexagramSchool)
        setFortuneAiPolish(snap.fortune?.aiPolish ?? DEFAULT_FORTUNE_SETTINGS.aiPolish)
        setModelsRefreshKey((k) => k + 1)
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
        <ModelsApiPanel refreshKey={modelsRefreshKey} />
      </div>

      <div className={styles.group} hidden={section !== 'image'}>
        <ImageEnginesPanel />
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

      <div className={styles.group} hidden={section !== 'agents'}>
        <AgentsPanel />
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
        <McpServersPanel />
      </div>

      <div className={styles.group} hidden={section !== 'notifications'}>
        <h2 className={styles.label}>{t('settings.notifications')}</h2>
        <p className={styles.desc}>{t('settings.channels.desc')}</p>

        <div className={styles.settingRow}>
          <div>
            <div className={styles.settingTitle}>{t('settings.channels.workbench')}</div>
            <div className={styles.settingHint}>{t('settings.channels.workbenchHint')}</div>
          </div>
          <ToggleSwitch
            checked={notifyChannels.workbenchInbox}
            label={t('settings.channels.workbench')}
            onChange={(workbenchInbox) => patchNotifyChannels({ workbenchInbox })}
          />
        </div>
        <div className={styles.settingRow}>
          <div>
            <div className={styles.settingTitle}>{t('settings.channels.desktop')}</div>
            <div className={styles.settingHint}>{t('settings.channels.desktopHint')}</div>
          </div>
          <ToggleSwitch
            checked={notifyChannels.desktopOs}
            label={t('settings.channels.desktop')}
            onChange={(desktopOs) => patchNotifyChannels({ desktopOs })}
          />
        </div>

        <div className={styles.channelCard}>
          <div className={styles.dataCardHead}>
            <div>
              <h3 className={styles.dataCardTitle}>{t('settings.channels.dingtalk')}</h3>
              <p className={styles.dataCardDesc}>{t('settings.channels.dingtalkHint')}</p>
            </div>
            <ToggleSwitch
              checked={notifyChannels.dingtalk.enabled}
              label={t('settings.channels.dingtalk')}
              onChange={(enabled) => patchNotifyChannels({ dingtalk: { ...notifyChannels.dingtalk, enabled } })}
            />
          </div>
          <label className={styles.field}>
            <span>{t('settings.channels.webhookUrl')}</span>
            <input
              value={notifyChannels.dingtalk.webhookUrl}
              onChange={(e) =>
                setNotifyChannels((c) => ({
                  ...c,
                  dingtalk: { ...c.dingtalk, webhookUrl: e.target.value },
                }))
              }
              onBlur={() => patchNotifyChannels({ dingtalk: notifyChannels.dingtalk })}
            />
          </label>
          <label className={styles.field}>
            <span>{t('settings.channels.dingtalkSecret')}</span>
            <input
              value={notifyChannels.dingtalk.secret}
              onChange={(e) =>
                setNotifyChannels((c) => ({
                  ...c,
                  dingtalk: { ...c.dingtalk, secret: e.target.value },
                }))
              }
              onBlur={() => patchNotifyChannels({ dingtalk: notifyChannels.dingtalk })}
            />
          </label>
          <SettingActionButton
            icon={<IconBell />}
            label={t('settings.channels.testDingTalk')}
            onClick={() => {
              setChannelTestMsg(null)
              void window.treasureChest.testDingTalkNotify().then((r) => {
                setChannelTestMsg(r.ok ? t('settings.channels.testOk') : t('settings.channels.testFail', { error: r.error }))
              })
            }}
          />
        </div>

        <div className={styles.channelCard}>
          <div className={styles.dataCardHead}>
            <div>
              <h3 className={styles.dataCardTitle}>{t('settings.channels.email')}</h3>
              <p className={styles.dataCardDesc}>{t('settings.channels.emailHint')}</p>
            </div>
            <ToggleSwitch
              checked={notifyChannels.email.enabled}
              label={t('settings.channels.email')}
              onChange={(enabled) => patchNotifyChannels({ email: { ...notifyChannels.email, enabled } })}
            />
          </div>
          {(
            [
              ['to', 'to'],
              ['from', 'from'],
              ['smtpHost', 'smtpHost'],
              ['user', 'user'],
              ['pass', 'pass'],
            ] as const
          ).map(([key, labelKey]) => (
            <label key={key} className={styles.field}>
              <span>{t(`settings.channels.${labelKey}`)}</span>
              <input
                type={key === 'pass' ? 'password' : 'text'}
                value={notifyChannels.email[key]}
                onChange={(e) =>
                  setNotifyChannels((c) => ({
                    ...c,
                    email: { ...c.email, [key]: e.target.value },
                  }))
                }
                onBlur={() => patchNotifyChannels({ email: notifyChannels.email })}
              />
            </label>
          ))}
          <label className={styles.field}>
            <span>{t('settings.channels.smtpPort')}</span>
            <input
              type="number"
              value={notifyChannels.email.smtpPort}
              onChange={(e) =>
                setNotifyChannels((c) => ({
                  ...c,
                  email: { ...c.email, smtpPort: Number(e.target.value) || 465 },
                }))
              }
              onBlur={() => patchNotifyChannels({ email: notifyChannels.email })}
            />
          </label>
          <div className={styles.settingRow}>
            <div className={styles.settingTitle}>{t('settings.channels.smtpSecure')}</div>
            <ToggleSwitch
              checked={notifyChannels.email.secure}
              label={t('settings.channels.smtpSecure')}
              onChange={(secure) => patchNotifyChannels({ email: { ...notifyChannels.email, secure } })}
            />
          </div>
          <SettingActionButton
            icon={<IconBell />}
            label={t('settings.channels.testEmail')}
            onClick={() => {
              setChannelTestMsg(null)
              void window.treasureChest.testEmailNotify().then((r) => {
                setChannelTestMsg(r.ok ? t('settings.channels.testOk') : t('settings.channels.testFail', { error: r.error }))
              })
            }}
          />
        </div>
        {channelTestMsg ? <p className={styles.desc}>{channelTestMsg}</p> : null}
      </div>

      <div className={styles.group} hidden={section !== 'dataSources'}>
        <DataSourcesPanel sources={dataSources} onSourcesChange={setDataSources} />
      </div>

      <div className={styles.group} hidden={section !== 'data'}>
        <h2 className={styles.label}>{t('settings.dataTitle')}</h2>
        <p className={styles.desc}>{t('settings.dataDesc')}</p>

        <div className={styles.dataStack}>
          <article className={styles.dataCard}>
            <div className={styles.dataCardBody}>
              <div className={styles.dataCardHead}>
                <div>
                  <h3 className={styles.dataCardTitle}>{t('settings.dataDirs')}</h3>
                  <p className={styles.dataCardDesc}>{t('settings.dataDirsDesc')}</p>
                </div>
              </div>
              <div className={styles.pathList}>
                <div className={styles.pathRow}>
                  <div className={styles.pathMeta}>
                    <span className={styles.pathLabel}>{t('settings.dataDirs.visionModels')}</span>
                    <span className={styles.pathHint}>{t('settings.dataDirs.visionModelsHint')}</span>
                    <span className={styles.pathValue} title={visionModelsRoot}>
                      {visionModelsRoot || '—'}
                    </span>
                  </div>
                  <div className={styles.pathActions}>
                    <SettingActionButton
                      icon={<IconUpload />}
                      label={t('settings.imageOpenDir')}
                      variant="ghost"
                      onClick={() => void window.treasureChest.openImageVisionModelsDir()}
                    />
                  </div>
                </div>
                <div className={styles.pathRow}>
                  <div className={styles.pathMeta}>
                    <span className={styles.pathLabel}>{t('settings.harnessSandbox')}</span>
                    <span className={styles.pathValue} title={harnessSandboxRoot}>
                      {harnessSandboxRoot || '—'}
                    </span>
                  </div>
                  <div className={styles.pathActions}>
                    <SettingActionButton
                      icon={<IconUpload />}
                      label={t('settings.harnessSandboxBrowse')}
                      variant="ghost"
                      onClick={onPickHarnessSandbox}
                    />
                  </div>
                </div>
                <div className={styles.pathRow}>
                  <div className={styles.pathMeta}>
                    <span className={styles.pathLabel}>{t('settings.harnessPluginsDir')}</span>
                    <span className={styles.pathValue} title={harnessPluginsDir}>
                      {harnessPluginsDir || '—'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </article>

          <article className={styles.dataCard}>
            <LibreOfficePanel />
          </article>

          <article className={styles.dataCard}>
            <div className={styles.dataCardBody}>
              <div className={styles.dataCardHead}>
                <div>
                  <h3 className={styles.dataCardTitle}>{t('settings.backup')}</h3>
                  <p className={styles.dataCardDesc}>{t('settings.backupDesc')}</p>
                </div>
              </div>
              <ul className={styles.backupList}>
                <li>{t('settings.backupIncludes')}</li>
                <li>{t('settings.backupExcludes')}</li>
              </ul>
              <div className={styles.dataActions}>
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
              {backupMsg ? <p className={styles.dataHint}>{backupMsg}</p> : null}
            </div>
          </article>

          <article className={styles.dataCard}>
            <details className={styles.dataAdvanced}>
              <summary>
                <div>
                  <h3 className={styles.dataCardTitle}>{t('settings.harness')}</h3>
                  <p className={styles.dataCardDesc}>{t('settings.harnessDesc')}</p>
                </div>
              </summary>
              <div className={styles.dataAdvancedBody}>
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
                      void window.treasureChest
                        .harnessCreateCordisProfile({ profileId: id })
                        .then((profileId) => {
                          setNewProfileDraft('')
                          setCordisProfile(profileId)
                          setHarnessHint(t('settings.harnessProfileCreated', { id: profileId }))
                          return window.treasureChest.harnessListCordisProfiles()
                        })
                        .then((profiles) => setCordisProfileOptions(profiles))
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
                      void window.treasureChest
                        .harnessCreateCordisBundle({ bundleId: id })
                        .then((bundleId) => {
                          setNewBundleDraft('')
                          setCordisBundles((prev) =>
                            prev.trim() ? `${prev}, ${bundleId}` : bundleId,
                          )
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
                    onChange={(e) =>
                      setSandboxModeDraft(e.target.value as 'local' | 'ssh' | 'container')
                    }
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
                      <input
                        className={styles.aiInput}
                        value={sshHostDraft}
                        onChange={(e) => setSshHostDraft(e.target.value)}
                      />
                    </label>
                    <label className={styles.aiField}>
                      <span className={styles.aiLabel}>{t('settings.harnessSshUser')}</span>
                      <input
                        className={styles.aiInput}
                        value={sshUserDraft}
                        onChange={(e) => setSshUserDraft(e.target.value)}
                      />
                    </label>
                    <label className={styles.aiField}>
                      <span className={styles.aiLabel}>{t('settings.harnessSshRemotePath')}</span>
                      <input
                        className={styles.aiInput}
                        value={sshPathDraft}
                        onChange={(e) => setSshPathDraft(e.target.value)}
                      />
                    </label>
                    <label className={styles.aiField}>
                      <span className={styles.aiLabel}>{t('settings.harnessSshPort')}</span>
                      <input
                        className={styles.aiInput}
                        value={sshPortDraft}
                        onChange={(e) => setSshPortDraft(e.target.value)}
                      />
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
                    <p className={styles.dataHint}>{t('settings.harnessContainerHint')}</p>
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
                <div className={styles.dataActions}>
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
                    variant="ghost"
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
                    variant="ghost"
                    onClick={() => void window.treasureChest.harnessOpenCordisRoot()}
                  />
                </div>

                <HarnessPluginMarketplace onHint={setHarnessHint} />
                {harnessHint ? <p className={styles.dataHint}>{harnessHint}</p> : null}
              </div>
            </details>
          </article>
        </div>
      </div>

      <div className={styles.group} hidden={section !== 'debug'}>
        <DebugPanel />
      </div>
      </section>
    </div>
  )
}

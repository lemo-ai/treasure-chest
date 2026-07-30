import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AppLocale, DesktopWidgetView, DialFaceStyle, HexagramSchool, LaunchBehavior, ThemeMode } from '@shared'
import { DEFAULT_DESKTOP_WIDGET, DEFAULT_FORTUNE_SETTINGS, DEFAULT_NOTIFICATION_SETTINGS, DIAL_FACE_STYLES, HEXAGRAM_SCHOOLS } from '@shared'
import { setAppLocale } from '@renderer/shared/lib/i18n'
import { useTheme } from '@renderer/shared/hooks/useTheme'
import { IconButton } from '@renderer/shared/ui/IconButton'
import { ToggleSwitch } from '@renderer/shared/ui/ToggleSwitch'
import { IconMonitor, IconMoon, IconSun } from '@renderer/shared/ui/icons'
import styles from './SettingsPage.module.css'

const themes: ThemeMode[] = ['light', 'dark', 'system']
const locales: AppLocale[] = ['zh-CN', 'en-US']
const launchBehaviors: LaunchBehavior[] = ['main', 'tray', 'widget']
const hexagramSchools: HexagramSchool[] = HEXAGRAM_SCHOOLS

const themeIcons = {
  light: <IconSun />,
  dark: <IconMoon />,
  system: <IconMonitor />,
} as const

export function SettingsPage(): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const { theme, setTheme } = useTheme()
  const [widget, setWidget] = useState<DesktopWidgetView>({
    ...DEFAULT_DESKTOP_WIDGET,
    backgroundImageUrl: null,
  })
  const [launchAtLogin, setLaunchAtLogin] = useState(false)
  const [launchBehavior, setLaunchBehavior] = useState<LaunchBehavior>('main')
  const [fortuneDailyNotify, setFortuneDailyNotify] = useState(DEFAULT_NOTIFICATION_SETTINGS.fortuneDaily)
  const [hexagramSchool, setHexagramSchool] = useState<HexagramSchool>(DEFAULT_FORTUNE_SETTINGS.hexagramSchool)
  const [fortuneAiPolish, setFortuneAiPolish] = useState(DEFAULT_FORTUNE_SETTINGS.aiPolish)
  const [backupMsg, setBackupMsg] = useState<string | null>(null)

  useEffect(() => {
    void window.treasureChest.getDesktopWidget().then(setWidget)
    void window.treasureChest.getSettingsSnapshot().then((snap) => {
      setLaunchBehavior(snap.launchBehavior)
      setFortuneDailyNotify(snap.notifications?.fortuneDaily ?? DEFAULT_NOTIFICATION_SETTINGS.fortuneDaily)
      setHexagramSchool(snap.fortune?.hexagramSchool ?? DEFAULT_FORTUNE_SETTINGS.hexagramSchool)
      setFortuneAiPolish(snap.fortune?.aiPolish ?? DEFAULT_FORTUNE_SETTINGS.aiPolish)
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
        setHexagramSchool(snap.fortune?.hexagramSchool ?? DEFAULT_FORTUNE_SETTINGS.hexagramSchool)
        setFortuneAiPolish(snap.fortune?.aiPolish ?? DEFAULT_FORTUNE_SETTINGS.aiPolish)
        const login = await window.treasureChest.getLaunchAtLogin()
        setLaunchAtLogin(login.configured)
        const w = await window.treasureChest.getDesktopWidget()
        setWidget(w)
      } else if (result.error) {
        setBackupMsg(t('settings.backupFailed', { error: result.error }))
      }
    })
  }

  return (
    <section className={styles.page}>
      <h1 className={styles.title}>{t('settings.title')}</h1>

      <div className={styles.group}>
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
              <button
                type="button"
                className={styles.bgBtn}
                onClick={() => void window.treasureChest.pickDialBackground().then(setWidget)}
              >
                {t('settings.desktopWidget.pickBackground')}
              </button>
              <button
                type="button"
                className={styles.bgBtnGhost}
                disabled={!widget.backgroundImagePath}
                onClick={() => void window.treasureChest.clearDialBackground().then(setWidget)}
              >
                {t('settings.desktopWidget.clearBackground')}
              </button>
            </div>
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

      <div className={styles.group}>
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
          <div className={styles.row}>
            {launchBehaviors.map((behavior) => (
              <IconButton
                key={behavior}
                icon={<span className={styles.localeMark}>{behavior[0]?.toUpperCase()}</span>}
                label={t(`settings.launchBehavior.${behavior}`)}
                showLabel
                variant="ghost"
                active={launchBehavior === behavior}
                onClick={() => onLaunchBehavior(behavior)}
              />
            ))}
          </div>
        </div>
      </div>

      <div className={styles.group}>
        <h2 className={styles.label}>{t('settings.fortune')}</h2>

        <div className={styles.faceBlock}>
          <div className={styles.settingTitle}>{t('settings.hexagramSchool')}</div>
          <div className={styles.settingHint}>{t('settings.hexagramSchoolHint')}</div>
          <div className={styles.row}>
            {hexagramSchools.map((school) => (
              <IconButton
                key={school}
                icon={<span className={styles.localeMark}>{school.slice(0, 1).toUpperCase()}</span>}
                label={t(`settings.hexagramSchool.${school}`)}
                showLabel
                variant="ghost"
                active={hexagramSchool === school}
                onClick={() => onHexagramSchool(school)}
              />
            ))}
          </div>
        </div>

        <div className={styles.settingRow}>
          <div>
            <div className={styles.settingTitle}>{t('settings.fortuneAiPolish')}</div>
            <div className={styles.settingHint}>{t('settings.fortuneAiPolishHint')}</div>
          </div>
          <ToggleSwitch
            checked={fortuneAiPolish}
            label={t('settings.fortuneAiPolish')}
            onChange={onFortuneAiPolish}
          />
        </div>
      </div>

      <div className={styles.group}>
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
      </div>

      <div className={styles.group}>
        <h2 className={styles.label}>{t('settings.theme')}</h2>
        <div className={styles.row}>
          {themes.map((mode) => (
            <IconButton
              key={mode}
              icon={themeIcons[mode]}
              label={t(`settings.theme.${mode}`)}
              showLabel
              variant="ghost"
              active={theme === mode}
              onClick={() => void setTheme(mode)}
            />
          ))}
        </div>
      </div>

      <div className={styles.group}>
        <h2 className={styles.label}>{t('settings.language')}</h2>
        <div className={styles.row}>
          {locales.map((locale) => (
            <IconButton
              key={locale}
              icon={<span className={styles.localeMark}>{locale.slice(0, 2).toUpperCase()}</span>}
              label={locale}
              showLabel
              variant="ghost"
              active={i18n.language === locale}
              onClick={() => void onLocale(locale)}
            />
          ))}
        </div>
      </div>

      <div className={styles.group}>
        <h2 className={styles.label}>{t('settings.backup')}</h2>
        <p className={styles.desc}>{t('settings.backupDesc')}</p>
        <div className={styles.row}>
          <button type="button" className={styles.bgBtn} onClick={onExportBackup}>
            {t('settings.exportBackup')}
          </button>
          <button type="button" className={styles.bgBtnGhost} onClick={onImportBackup}>
            {t('settings.importBackup')}
          </button>
        </div>
        {backupMsg ? <p className={styles.hint}>{backupMsg}</p> : null}
      </div>
    </section>
  )
}

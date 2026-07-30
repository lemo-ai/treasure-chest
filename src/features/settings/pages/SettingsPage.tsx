import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AppLocale, DesktopWidgetView, DialFaceStyle, ThemeMode } from '@shared'
import { DEFAULT_DESKTOP_WIDGET, DIAL_FACE_STYLES } from '@shared'
import { setAppLocale } from '@renderer/shared/lib/i18n'
import { useTheme } from '@renderer/shared/hooks/useTheme'
import { IconButton } from '@renderer/shared/ui/IconButton'
import { ToggleSwitch } from '@renderer/shared/ui/ToggleSwitch'
import { IconMonitor, IconMoon, IconSun } from '@renderer/shared/ui/icons'
import styles from './SettingsPage.module.css'

const themes: ThemeMode[] = ['light', 'dark', 'system']
const locales: AppLocale[] = ['zh-CN', 'en-US']

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

  useEffect(() => {
    void window.treasureChest.getDesktopWidget().then(setWidget)
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

      <p className={styles.hint}>{t('settings.backup')}</p>
    </section>
  )
}

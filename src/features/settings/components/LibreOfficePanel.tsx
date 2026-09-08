import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SettingActionButton } from '@renderer/shared/ui/SettingActionButton'
import { IconDownload, IconUpload } from '@renderer/shared/ui/icons'
import styles from '../pages/SettingsPage.module.css'

type LoStatus = {
  ok: boolean
  path?: string
  version?: string
  error?: string
  customPath?: string
  source?: 'custom' | 'auto' | 'none'
}

export function LibreOfficePanel(): React.JSX.Element {
  const { t } = useTranslation()
  const [status, setStatus] = useState<LoStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState('')

  const refresh = useCallback(async () => {
    setStatus(await window.treasureChest.checkLibreOffice())
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const withBusy = async (fn: () => Promise<void>): Promise<void> => {
    setBusy(true)
    setHint('')
    try {
      await fn()
    } catch (err) {
      setHint(err instanceof Error ? err.message : t('tools.errors.generic'))
    } finally {
      setBusy(false)
    }
  }

  const badge =
    status == null
      ? { className: styles.dataBadgeMuted, text: t('settings.libreOfficeChecking') }
      : status.ok
        ? {
            className: styles.dataBadgeOk,
            text: t('settings.libreOfficeReadyShort', {
              version: status.version || 'LibreOffice',
            }),
          }
        : { className: styles.dataBadgeBad, text: t('settings.libreOfficeMissingShort') }

  return (
    <div className={styles.dataCardBody}>
      <div className={styles.dataCardHead}>
        <div>
          <h3 className={styles.dataCardTitle}>{t('settings.libreOfficeTitle')}</h3>
          <p className={styles.dataCardDesc}>{t('settings.libreOfficeHint')}</p>
        </div>
        <span className={badge.className}>{badge.text}</span>
      </div>

      <div className={styles.pathRow}>
        <div className={styles.pathMeta}>
          <span className={styles.pathLabel}>{t('settings.libreOfficePath')}</span>
          <span className={styles.pathValue} title={status?.customPath || status?.path || ''}>
            {status?.customPath || status?.path || t('settings.libreOfficePathPlaceholder')}
          </span>
        </div>
      </div>

      <div className={styles.dataActions}>
        <SettingActionButton
          icon={<IconDownload />}
          label={t('settings.libreOfficeInstall')}
          variant="secondary"
          disabled={busy}
          onClick={() =>
            void withBusy(async () => {
              await window.treasureChest.openLibreOfficeDownload()
              setHint(t('settings.libreOfficeInstallOpened'))
            })
          }
        />
        <SettingActionButton
          icon={<IconUpload />}
          label={t('settings.libreOfficeBrowse')}
          variant="secondary"
          disabled={busy}
          onClick={() =>
            void withBusy(async () => {
              setStatus(await window.treasureChest.pickLibreOffice())
            })
          }
        />
        <SettingActionButton
          icon={<IconUpload />}
          label={t('settings.libreOfficeRecheck')}
          variant="ghost"
          disabled={busy}
          onClick={() => void withBusy(refresh)}
        />
        {status?.customPath ? (
          <SettingActionButton
            icon={<IconUpload />}
            label={t('settings.libreOfficeClear')}
            variant="ghost"
            disabled={busy}
            onClick={() =>
              void withBusy(async () => {
                setStatus(await window.treasureChest.clearLibreOffice())
              })
            }
          />
        ) : null}
      </div>
      {hint ? <p className={styles.dataHint}>{hint}</p> : null}
      {!status?.ok && status != null ? (
        <p className={styles.dataHint}>
          {status.error === 'custom_path_missing'
            ? t('settings.libreOfficeCustomMissing')
            : t('settings.libreOfficeMissing')}
        </p>
      ) : null}
    </div>
  )
}

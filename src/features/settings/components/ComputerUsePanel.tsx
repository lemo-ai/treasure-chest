import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { ComputerUseSettings } from '@shared'
import { DEFAULT_COMPUTER_USE_SETTINGS } from '@shared'
import { ToggleSwitch } from '@renderer/shared/ui/ToggleSwitch'
import styles from './ComputerUsePanel.module.css'

export function ComputerUsePanel(): ReactNode {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<ComputerUseSettings>({ ...DEFAULT_COMPUTER_USE_SETTINGS })
  const [hostsText, setHostsText] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const reload = async (): Promise<void> => {
    const s = await window.treasureChest.computerUseGetSettings()
    setSettings(s)
    setHostsText(s.allowHosts.join('\n'))
  }

  useEffect(() => {
    void reload()
  }, [])

  const persist = async (next: Partial<ComputerUseSettings>): Promise<void> => {
    setBusy(true)
    setMsg('')
    try {
      const saved = await window.treasureChest.computerUseSetSettings(next)
      setSettings(saved)
      setHostsText(saved.allowHosts.join('\n'))
      setMsg(t('settings.computerUse.saved'))
    } finally {
      setBusy(false)
    }
  }

  const saveHosts = async (): Promise<void> => {
    const allowHosts = hostsText
      .split(/[\n,]+/)
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean)
    await persist({ allowHosts })
  }

  return (
    <div className={styles.wrap}>
      <p className={styles.hint}>{t('settings.computerUse.hint')}</p>
      <p className={styles.warn}>{t('settings.computerUse.safety')}</p>

      <div className={styles.row}>
        <div>
          <div className={styles.title}>{t('settings.computerUse.enabled')}</div>
          <div className={styles.sub}>{t('settings.computerUse.enabledHint')}</div>
        </div>
        <ToggleSwitch
          checked={settings.enabled}
          label={t('settings.computerUse.enabled')}
          onChange={(enabled) => {
            if (busy) return
            void persist({ enabled })
          }}
        />
      </div>

      <div className={styles.block}>
        <div className={styles.title}>{t('settings.computerUse.allowHosts')}</div>
        <p className={styles.sub}>{t('settings.computerUse.allowHostsHint')}</p>
        <textarea
          className={styles.textarea}
          rows={5}
          value={hostsText}
          disabled={busy}
          placeholder={t('settings.computerUse.allowHostsPlaceholder')}
          onChange={(e) => setHostsText(e.target.value)}
        />
        <button type="button" className={styles.btn} disabled={busy} onClick={() => void saveHosts()}>
          {t('settings.computerUse.saveHosts')}
        </button>
      </div>

      <ul className={styles.list}>
        <li>{t('settings.computerUse.scopeBrowser')}</li>
        <li>{t('settings.computerUse.scopeOs')}</li>
        <li>{t('settings.computerUse.scopeApproval')}</li>
      </ul>

      {msg ? <p className={styles.msg}>{msg}</p> : null}
    </div>
  )
}

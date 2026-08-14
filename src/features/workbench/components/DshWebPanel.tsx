import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import styles from './DshWebPanel.module.css'

interface DshWebPanelProps {
  active: boolean
}

export function DshWebPanel({ active }: DshWebPanelProps): ReactNode {
  const { t } = useTranslation()
  const [url, setUrl] = useState('')
  const [embedded, setEmbedded] = useState(false)

  useEffect(() => {
    if (!active) return
    void Promise.all([
      window.treasureChest.harnessGetDshWebUrl(),
      window.treasureChest.harnessGetEmbeddedDshWebPreferred(),
    ]).then(([nextUrl, pref]) => {
      setUrl(nextUrl)
      setEmbedded(pref)
    })
  }, [active])

  if (!active) return null

  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <span>{embedded ? t('workbench.dshWebEmbeddedSub') : t('workbench.dshWebSub')}</span>
        <code className={styles.url}>{url || '…'}</code>
      </div>
      {url ? (
        <iframe className={styles.frame} src={url} title={t('workbench.dshWebTitle')} />
      ) : (
        <p className={styles.empty}>{t('workbench.dshWebLoading')}</p>
      )}
    </div>
  )
}

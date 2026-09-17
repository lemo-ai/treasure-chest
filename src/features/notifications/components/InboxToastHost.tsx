import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { InboxItem } from '@shared'
import { IconBell, IconClose } from '@renderer/shared/ui/icons'
import styles from './InboxToastHost.module.css'

type ToastItem = InboxItem & { toastId: string }

const MAX_VISIBLE = 3
const AUTO_DISMISS_MS = 6500

export function InboxToastHost(): React.JSX.Element | null {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [toasts, setToasts] = useState<ToastItem[]>([])

  useEffect(() => {
    const off = window.treasureChest.onInboxAppended((item) => {
      const toastId = `${item.id}_${Date.now()}`
      setToasts((prev) => [{ ...item, toastId }, ...prev].slice(0, MAX_VISIBLE))
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.toastId !== toastId))
      }, AUTO_DISMISS_MS)
    })
    return () => off()
  }, [])

  if (toasts.length === 0) return null

  return (
    <div className={styles.host} aria-live="polite">
      {toasts.map((toast) => (
        <button
          key={toast.toastId}
          type="button"
          className={`${styles.toast} ${toast.status === 'error' ? styles.toastError : styles.toastOk}`}
          onClick={() => {
            setToasts((prev) => prev.filter((x) => x.toastId !== toast.toastId))
            navigate(`/notifications?id=${encodeURIComponent(toast.id)}`)
          }}
        >
          <span className={styles.icon}>
            <IconBell />
          </span>
          <span className={styles.body}>
            <span className={styles.title}>{toast.title}</span>
            <span className={styles.summary}>{toast.summary}</span>
            <span className={styles.hint}>{t('inbox.toastOpen')}</span>
          </span>
          <span
            className={styles.close}
            role="button"
            tabIndex={0}
            aria-label={t('inbox.toastDismiss')}
            onClick={(e) => {
              e.stopPropagation()
              setToasts((prev) => prev.filter((x) => x.toastId !== toast.toastId))
            }}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' && e.key !== ' ') return
              e.preventDefault()
              e.stopPropagation()
              setToasts((prev) => prev.filter((x) => x.toastId !== toast.toastId))
            }}
          >
            <IconClose />
          </span>
        </button>
      ))}
    </div>
  )
}

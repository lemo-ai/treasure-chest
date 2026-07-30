import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { CHANGELOG, type ChangelogLocale } from '@renderer/shared/data/changelog'
import { IconClose } from '@renderer/shared/ui/icons'
import styles from './ChangelogModal.module.css'

interface ChangelogModalProps {
  version: string
  onClose: () => void
}

export function ChangelogModal({ version, onClose }: ChangelogModalProps): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const locale: ChangelogLocale = i18n.language.startsWith('zh') ? 'zh-CN' : 'en-US'

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className={styles.backdrop} role="presentation" onClick={onClose}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="changelog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className={styles.head}>
          <div>
            <h2 id="changelog-title" className={styles.title}>
              {t('changelog.title')}
            </h2>
            <p className={styles.sub}>{t('changelog.current', { version })}</p>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label={t('changelog.close')}>
            <IconClose />
          </button>
        </header>

        <div className={styles.list}>
          {CHANGELOG.map((release) => (
            <section key={release.version} className={styles.release}>
              <div className={styles.releaseHead}>
                <span className={styles.versionBadge}>v{release.version}</span>
                <span className={styles.releaseTitle}>{release.title[locale]}</span>
                <time className={styles.date} dateTime={release.date}>
                  {release.date}
                </time>
              </div>
              <ul className={styles.items}>
                {release.items[locale].map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}

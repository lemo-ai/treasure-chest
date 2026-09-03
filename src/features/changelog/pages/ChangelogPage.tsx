import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CHANGELOG, type ChangelogLocale } from '@renderer/shared/data/changelog'
import styles from './ChangelogPage.module.css'

export function ChangelogPage(): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const locale: ChangelogLocale = i18n.language.startsWith('zh') ? 'zh-CN' : 'en-US'
  const [version, setVersion] = useState('')

  useEffect(() => {
    void window.treasureChest.getVersion().then(setVersion)
  }, [])

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>{t('changelog.title')}</h1>
          <p className={styles.sub}>
            {version
              ? t('changelog.current', { version })
              : t('changelog.openHint')}
          </p>
        </div>
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
  )
}

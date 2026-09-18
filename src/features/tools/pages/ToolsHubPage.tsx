import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import {
  IconGlobe,
  IconGrid,
  IconImage,
  IconLayers,
  IconTools,
  IconVideo,
  IconMusic,
  IconWrite,
} from '@renderer/shared/ui/icons'
import styles from './ToolsHubPage.module.css'

type ToolCard = {
  id: string
  to?: string
  icon: React.ReactNode
  soon?: boolean
}

const READY: ToolCard[] = [
  { id: 'timestamp', to: '/tools/timestamp', icon: <IconTools /> },
  { id: 'timezone', to: '/tools/timezone', icon: <IconGlobe /> },
  { id: 'worldtime', to: '/tools/worldtime', icon: <IconGrid /> },
  { id: 'json', to: '/tools/json', icon: <IconLayers /> },
  { id: 'crawl', to: '/tools/crawl', icon: <IconGlobe /> },
  { id: 'image', to: '/tools/image', icon: <IconImage /> },
  { id: 'video', to: '/tools/video', icon: <IconVideo /> },
  { id: 'audio', to: '/tools/audio', icon: <IconMusic /> },
  { id: 'doc', to: '/tools/doc', icon: <IconWrite /> },
]

const COMING: ToolCard[] = []

export function ToolsHubPage(): React.JSX.Element {
  const { t } = useTranslation()

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t('tools.hub.title')}</h1>
        <p className={styles.subtitle}>{t('tools.hub.subtitle')}</p>
      </header>

      <p className={styles.sectionLabel}>{t('tools.hub.ready')}</p>
      <div className={styles.grid}>
        {READY.map((tool) => (
          <Link key={tool.id} to={tool.to!} className={styles.card}>
            <span className={styles.iconWrap}>{tool.icon}</span>
            <h2 className={styles.cardTitle}>{t(`tools.${tool.id}.title`)}</h2>
            <p className={styles.cardDesc}>{t(`tools.${tool.id}.desc`)}</p>
          </Link>
        ))}
      </div>

      {COMING.length > 0 ? (
        <>
          <p className={styles.sectionLabel}>{t('tools.hub.coming')}</p>
          <div className={styles.grid}>
            {COMING.map((tool) => (
              <div key={tool.id} className={`${styles.card} ${styles.cardSoon}`} aria-disabled>
                <span className={styles.iconWrap}>{tool.icon}</span>
                <h2 className={styles.cardTitle}>{t(`tools.${tool.id}.title`)}</h2>
                <p className={styles.cardDesc}>{t(`tools.${tool.id}.desc`)}</p>
                <span className={styles.badge}>{t('tools.hub.soon')}</span>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </section>
  )
}

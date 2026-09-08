import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { IconChevronLeft } from '@renderer/shared/ui/icons'
import styles from './ToolShell.module.css'

interface ToolShellProps {
  title: string
  subtitle?: string
  wide?: boolean
  compact?: boolean
  children: React.ReactNode
}

export function ToolShell({
  title,
  subtitle,
  wide = false,
  compact = false,
  children,
}: ToolShellProps): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <section className={`${styles.page} ${wide ? styles.wide : ''} ${compact ? styles.compact : ''}`}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <Link to="/tools" className={styles.back}>
            <span className={styles.backIcon} aria-hidden>
              <IconChevronLeft />
            </span>
            <span>{t('tools.backToHub')}</span>
          </Link>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>{title}</h1>
            {subtitle && !compact ? <p className={styles.subtitle}>{subtitle}</p> : null}
          </div>
        </div>
      </header>
      {children}
    </section>
  )
}

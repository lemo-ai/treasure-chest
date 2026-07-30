import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { DailyFortune } from '@shared'
import { FortuneSummary } from './FortuneSummary'
import styles from './FortunePanel.module.css'

interface FortunePanelProps {
  fortune: DailyFortune | null
  compact?: boolean
}

export function FortunePanel({ fortune, compact = false }: FortunePanelProps): React.JSX.Element {
  const { t, i18n } = useTranslation()

  return (
    <section className={styles.root}>
      <p className={styles.disclaimer}>{t('fortune.disclaimer')}</p>
      {fortune ? (
        <FortuneSummary fortune={fortune} locale={i18n.language} compact={compact} />
      ) : (
        <p className={styles.empty}>
          {t('fortune.empty')}{' '}
          <Link to="/fortune">{t('fortune.setupCta')}</Link>
        </p>
      )}
    </section>
  )
}

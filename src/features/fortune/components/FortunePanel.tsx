import { useTranslation } from 'react-i18next'
import type { DailyFortune } from '@shared'
import { FortuneSummary } from './FortuneSummary'
import styles from './FortunePanel.module.css'

interface FortunePanelProps {
  fortune: DailyFortune | null
  compact?: boolean
  className?: string
}

export function FortunePanel({
  fortune,
  compact = false,
  className,
}: FortunePanelProps): React.JSX.Element {
  const { t, i18n } = useTranslation()

  return (
    <section className={[styles.root, className].filter(Boolean).join(' ')}>
      <p className={styles.disclaimer}>{t('fortune.disclaimer')}</p>
      {fortune ? (
        <FortuneSummary fortune={fortune} locale={i18n.language} compact={compact} />
      ) : (
        <p className={styles.empty}>
          {t('fortune.empty')}{' '}
          <button
            type="button"
            className={styles.emptyLink}
            onClick={() => void window.treasureChest.showMainWindow()}
          >
            {t('fortune.setupCta')}
          </button>
        </p>
      )}
    </section>
  )
}

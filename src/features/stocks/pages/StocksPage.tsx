import { useTranslation } from 'react-i18next'
import styles from '@renderer/shared/styles/FeaturePlaceholder.module.css'

export function StocksPage(): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <section className={styles.page}>
      <h1 className={styles.title}>{t('stocks.title')}</h1>
      <p className={styles.body}>{t('stocks.placeholder')}</p>
    </section>
  )
}

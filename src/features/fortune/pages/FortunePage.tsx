import { useTranslation } from 'react-i18next'
import styles from '@renderer/shared/styles/FeaturePlaceholder.module.css'

export function FortunePage(): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <section className={styles.page}>
      <h1 className={styles.title}>{t('fortune.title')}</h1>
      <p className={styles.body}>{t('fortune.placeholder')}</p>
    </section>
  )
}

import { useTranslation } from 'react-i18next'
import { IconBook } from '@renderer/shared/ui/icons'
import styles from './KnowledgePage.module.css'

/** Placeholder until knowledge ingest/RAG modules land. */
export function KnowledgePage(): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <div className={styles.mark}>
          <IconBook />
        </div>
        <h1 className={styles.title}>{t('knowledge.title')}</h1>
        <p className={styles.sub}>{t('knowledge.subtitle')}</p>
        <ul className={styles.list}>
          <li>{t('knowledge.bullet1')}</li>
          <li>{t('knowledge.bullet2')}</li>
          <li>{t('knowledge.bullet3')}</li>
        </ul>
      </div>
    </div>
  )
}

import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { HarnessSubagentMeta } from '@shared'
import styles from './SubagentCard.module.css'

interface SubagentCardProps {
  meta: HarnessSubagentMeta
  onOpenChild?: (childSessionId: string) => void
}

export function SubagentCard({ meta, onOpenChild }: SubagentCardProps): ReactNode {
  const { t } = useTranslation()
  const running = meta.phase === 'start'
  const errored = meta.phase === 'end' && meta.status === 'error'
  const statusLabel = running
    ? t('workbench.subagent.status.running')
    : errored
      ? t('workbench.subagent.status.error')
      : t('workbench.subagent.status.complete')

  return (
    <div className={styles.card} data-status={running ? 'running' : errored ? 'error' : 'complete'}>
      <div className={styles.head}>
        <span className={styles.badge}>{statusLabel}</span>
        <strong className={styles.title}>
          {meta.agentId
            ? t('workbench.subagent.withAgent', { agent: meta.agentId })
            : t('workbench.subagent.title')}
        </strong>
      </div>
      {meta.task ? <p className={styles.task}>{meta.task}</p> : null}
      {meta.resultPreview ? <p className={styles.preview}>{meta.resultPreview}</p> : null}
      {meta.childSessionId && onOpenChild ? (
        <button
          type="button"
          className={styles.openBtn}
          onClick={() => onOpenChild(meta.childSessionId)}
        >
          {t('workbench.trajectoryOpenChild')}
        </button>
      ) : null}
    </div>
  )
}

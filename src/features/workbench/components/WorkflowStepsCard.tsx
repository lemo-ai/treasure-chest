import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { WorkflowStepState } from '../lib/workflows'
import styles from './WorkflowStepsCard.module.css'

interface WorkflowStepsCardProps {
  title: string
  steps: WorkflowStepState[]
}

export function WorkflowStepsCard({ title, steps }: WorkflowStepsCardProps): ReactNode {
  const { t } = useTranslation()
  if (!steps.length) return null
  const running = steps.some((s) => s.status === 'running')
  const failed = steps.some((s) => s.status === 'error')
  const done = steps.every((s) => s.status === 'done')

  return (
    <div className={styles.card} aria-live="polite">
      <div className={styles.head}>
        <span
          className={`${styles.dot} ${
            running ? styles.dotPulse : failed ? styles.dotError : done ? styles.dotOk : styles.dotIdle
          }`}
        />
        <strong className={styles.title}>{title}</strong>
        <span className={styles.meta}>
          {running
            ? t('workbench.workflow.running')
            : failed
              ? t('workbench.workflow.failed')
              : done
                ? t('workbench.workflow.done')
                : t('workbench.workflow.pending')}
        </span>
      </div>
      <ol className={styles.list}>
        {steps.map((step, i) => (
          <li key={step.id} className={styles.item}>
            <span className={styles.index}>{i + 1}</span>
            <span className={styles.label}>{step.label}</span>
            <span
              className={`${styles.badge} ${
                step.status === 'running'
                  ? styles.badgeRunning
                  : step.status === 'done'
                    ? styles.badgeDone
                    : step.status === 'error'
                      ? styles.badgeError
                      : styles.badgePending
              }`}
            >
              {step.status === 'running'
                ? t('workbench.workflow.status.running')
                : step.status === 'done'
                  ? t('workbench.workflow.status.done')
                  : step.status === 'error'
                    ? t('workbench.workflow.status.error')
                    : t('workbench.workflow.status.pending')}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

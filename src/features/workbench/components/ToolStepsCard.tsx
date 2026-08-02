import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { LlmToolStep } from '@shared'
import styles from './ToolStepsCard.module.css'

interface ToolStepsCardProps {
  steps: LlmToolStep[]
  /** Live streaming: keep expanded by default */
  defaultOpen?: boolean
}

export function ToolStepsCard({ steps, defaultOpen }: ToolStepsCardProps): ReactNode {
  const { t } = useTranslation()
  const running = steps.some((s) => s.status === 'running' || s.status === 'pending')
  const [open, setOpen] = useState(defaultOpen ?? running)
  if (!steps.length) return null

  const done = steps.filter((s) => s.status === 'done').length
  const failed = steps.filter((s) => s.status === 'error' || s.status === 'denied').length
  const pending = steps.some((s) => s.status === 'pending')
  const summary = pending
    ? t('workbench.tools.pendingApproval')
    : running
      ? t('workbench.tools.running', { count: steps.length })
      : failed
        ? t('workbench.tools.doneWithErrors', { done, failed })
        : t('workbench.tools.done', { count: steps.length })

  return (
    <div className={styles.card}>
      <button type="button" className={styles.head} onClick={() => setOpen((v) => !v)}>
        <span
          className={`${styles.dot} ${running ? styles.dotPulse : failed ? styles.dotError : styles.dotOk}`}
        />
        <span className={styles.summary}>{summary}</span>
        <span className={styles.chevron}>{open ? '▾' : '▸'}</span>
      </button>
      {open ? (
        <ol className={styles.list}>
          {steps.map((step) => (
            <li key={step.id} className={styles.item}>
              <div className={styles.itemHead}>
                <span
                  className={`${styles.badge} ${
                    step.status === 'running' || step.status === 'pending'
                      ? styles.badgeRunning
                      : step.status === 'error' || step.status === 'denied'
                        ? styles.badgeError
                        : styles.badgeDone
                  }`}
                >
                  {step.status === 'pending'
                    ? t('workbench.tools.status.pending')
                    : step.status === 'denied'
                      ? t('workbench.tools.status.denied')
                      : step.status === 'running'
                        ? t('workbench.tools.status.running')
                        : step.status === 'error'
                          ? t('workbench.tools.status.error')
                          : t('workbench.tools.status.done')}
                </span>
                <strong className={styles.name}>{step.label || step.name}</strong>
                <code className={styles.fn}>{step.name}</code>
              </div>
              {step.argsPreview ? (
                <div className={styles.meta}>
                  <span className={styles.metaLabel}>{t('workbench.tools.args')}</span>
                  <code>{step.argsPreview}</code>
                </div>
              ) : null}
              {step.resultPreview ? (
                <div className={styles.meta}>
                  <span className={styles.metaLabel}>
                    {step.status === 'error' || step.status === 'denied'
                      ? t('workbench.tools.error')
                      : t('workbench.tools.result')}
                  </span>
                  <code>{step.resultPreview}</code>
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  )
}

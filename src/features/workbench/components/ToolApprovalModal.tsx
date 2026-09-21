import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { ToolApprovalRequest } from '@shared'
import styles from './ToolApprovalModal.module.css'

export type ToolApprovalDecision = 'deny' | 'allow' | 'always'

interface ToolApprovalModalProps {
  request: ToolApprovalRequest
  onResolve: (decision: ToolApprovalDecision) => void
}

export function ToolApprovalModal({ request, onResolve }: ToolApprovalModalProps): ReactNode {
  const { t } = useTranslation()
  return (
    <div className={styles.backdrop} role="presentation">
      <div
        className={styles.dialog}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="tool-approval-title"
      >
        <h2 id="tool-approval-title" className={styles.title}>
          {t('workbench.approval.title')}
        </h2>
        <p className={styles.body}>{t('workbench.approval.body')}</p>
        <div className={styles.meta}>
          <div>
            <span className={styles.label}>{t('workbench.approval.tool')}</span>
            <strong>{request.label}</strong>
            <code>{request.name}</code>
          </div>
          {request.argsPreview ? (
            <div>
              <span className={styles.label}>{t('workbench.tools.args')}</span>
              <code className={styles.args}>{request.argsPreview}</code>
            </div>
          ) : null}
          <p className={styles.reason}>
            {t(`workbench.approval.reason.${request.reason}` as 'workbench.approval.reason.destructive_or_write', {
              defaultValue: request.reason,
            })}
          </p>
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.deny} onClick={() => onResolve('deny')}>
            {t('workbench.approval.deny')}
          </button>
          <button type="button" className={styles.allowOnce} onClick={() => onResolve('allow')}>
            {t('workbench.approval.allow')}
          </button>
          <button type="button" className={styles.allow} onClick={() => onResolve('always')}>
            {t('workbench.approval.allowSession')}
          </button>
        </div>
      </div>
    </div>
  )
}

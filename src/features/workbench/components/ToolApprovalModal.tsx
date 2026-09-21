import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { ToolApprovalRequest } from '@shared'
import styles from './ToolApprovalModal.module.css'

export type ToolApprovalDecision = 'deny' | 'allow' | 'always'

interface ToolApprovalModalProps {
  request: ToolApprovalRequest
  onResolve: (decision: ToolApprovalDecision) => void
}

function lineDiffPreview(before: string, after: string): string {
  const a = before.split('\n')
  const b = after.split('\n')
  const max = Math.max(a.length, b.length)
  const lines: string[] = []
  for (let i = 0; i < max && lines.length < 120; i++) {
    const left = a[i]
    const right = b[i]
    if (left === right) {
      if (left !== undefined) lines.push(`  ${left}`)
      continue
    }
    if (left !== undefined) lines.push(`- ${left}`)
    if (right !== undefined) lines.push(`+ ${right}`)
  }
  if (max > 120) lines.push('…')
  return lines.join('\n')
}

export function ToolApprovalModal({ request, onResolve }: ToolApprovalModalProps): ReactNode {
  const { t } = useTranslation()
  const diffs = request.fileDiffs?.filter((d) => d.path) ?? []
  const isFileEdit = diffs.length > 0

  return (
    <div className={styles.backdrop} role="presentation">
      <div
        className={`${styles.dialog} ${isFileEdit ? styles.dialogWide : ''}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="tool-approval-title"
      >
        <h2 id="tool-approval-title" className={styles.title}>
          {isFileEdit ? t('workbench.approval.diffTitle') : t('workbench.approval.title')}
        </h2>
        <p className={styles.body}>
          {isFileEdit ? t('workbench.approval.diffBody') : t('workbench.approval.body')}
        </p>
        <div className={styles.meta}>
          <div>
            <span className={styles.label}>{t('workbench.approval.tool')}</span>
            <strong>{request.label}</strong>
            <code>{request.name}</code>
          </div>
          {diffs.length ? (
            <div className={styles.diffList}>
              <span className={styles.label}>{t('workbench.approval.diffFiles')}</span>
              {diffs.map((d) => (
                <div key={d.path} className={styles.diffBlock}>
                  <div className={styles.diffPath}>
                    {d.path}
                    {d.truncated ? <span className={styles.diffTrunc}>{t('workbench.approval.diffTruncated')}</span> : null}
                  </div>
                  <pre className={styles.diffPre}>{lineDiffPreview(d.before, d.after)}</pre>
                </div>
              ))}
            </div>
          ) : request.argsPreview ? (
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
            {isFileEdit ? t('workbench.approval.rejectEdit') : t('workbench.approval.deny')}
          </button>
          <button type="button" className={styles.allowOnce} onClick={() => onResolve('allow')}>
            {isFileEdit ? t('workbench.approval.acceptEdit') : t('workbench.approval.allow')}
          </button>
          <button type="button" className={styles.allow} onClick={() => onResolve('always')}>
            {t('workbench.approval.allowSession')}
          </button>
        </div>
      </div>
    </div>
  )
}

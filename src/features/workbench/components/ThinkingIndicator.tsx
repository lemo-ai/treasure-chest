import type { ReactNode } from 'react'
import styles from './ThinkingIndicator.module.css'

interface ThinkingIndicatorProps {
  label: string
}

export function ThinkingIndicator({ label }: ThinkingIndicatorProps): ReactNode {
  return (
    <div className={styles.wrap} role="status" aria-live="polite" aria-label={label}>
      <span className={styles.dots} aria-hidden>
        <i className={styles.dot} />
        <i className={styles.dot} />
        <i className={styles.dot} />
        <i className={styles.dot} />
      </span>
      <span className={styles.label}>{label}</span>
    </div>
  )
}

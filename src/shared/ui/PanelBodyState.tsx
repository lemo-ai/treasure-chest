import type { ReactNode } from 'react'
import styles from './PanelBodyState.module.css'

export type PanelBodyStatus = 'loading' | 'empty' | 'error' | 'ready'

interface PanelBodyStateProps {
  status: PanelBodyStatus
  loadingLabel: string
  emptyLabel: string
  errorLabel?: string
  children?: ReactNode
  className?: string
}

/** Shared loading / empty / error body for side panels and settings blocks. */
export function PanelBodyState({
  status,
  loadingLabel,
  emptyLabel,
  errorLabel,
  children,
  className,
}: PanelBodyStateProps): ReactNode {
  if (status === 'loading') {
    return <p className={`${styles.state} ${className ?? ''}`}>{loadingLabel}</p>
  }
  if (status === 'error') {
    return (
      <p className={`${styles.state} ${styles.error} ${className ?? ''}`} role="alert">
        {errorLabel || emptyLabel}
      </p>
    )
  }
  if (status === 'empty') {
    return <p className={`${styles.state} ${className ?? ''}`}>{emptyLabel}</p>
  }
  return <>{children}</>
}

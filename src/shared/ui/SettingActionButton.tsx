import type { ButtonHTMLAttributes, ReactNode } from 'react'
import styles from './SettingActionButton.module.css'

type Variant = 'primary' | 'secondary' | 'ghost'

interface SettingActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode
  label: string
  variant?: Variant
}

export function SettingActionButton({
  icon,
  label,
  variant = 'secondary',
  className,
  type = 'button',
  ...rest
}: SettingActionButtonProps): React.JSX.Element {
  const classes = [styles.btn, styles[variant], className ?? ''].filter(Boolean).join(' ')

  return (
    <button type={type} className={classes} {...rest}>
      <span className={styles.icon}>{icon}</span>
      <span className={styles.label}>{label}</span>
    </button>
  )
}

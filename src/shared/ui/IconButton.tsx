import type { ButtonHTMLAttributes, ReactNode } from 'react'
import styles from './IconButton.module.css'

type Variant = 'ghost' | 'soft' | 'brand'
type Size = 'sm' | 'md'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode
  label: string
  showLabel?: boolean
  variant?: Variant
  size?: Size
  active?: boolean
}

export function IconButton({
  icon,
  label,
  showLabel = false,
  variant = 'ghost',
  size = 'md',
  active = false,
  className,
  type = 'button',
  ...rest
}: IconButtonProps): React.JSX.Element {
  const classes = [
    styles.btn,
    styles[variant],
    styles[size],
    showLabel ? styles.withLabel : '',
    active ? styles.active : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button type={type} className={classes} aria-label={label} title={label} {...rest}>
      {icon}
      {showLabel ? <span className={styles.label}>{label}</span> : null}
    </button>
  )
}

import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { IconCheck } from './icons'
import styles from './SettingOption.module.css'

export type SettingOptionTone = 'brand' | 'accent' | 'highlight' | 'neutral'

interface SettingOptionProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode
  label: string
  description?: string
  active?: boolean
  tone?: SettingOptionTone
}

export function SettingOption({
  icon,
  label,
  description,
  active = false,
  tone = 'brand',
  className,
  type = 'button',
  ...rest
}: SettingOptionProps): React.JSX.Element {
  const classes = [
    styles.option,
    styles[tone],
    active ? styles.active : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button type={type} className={classes} aria-pressed={active} {...rest}>
      {active ? (
        <span className={styles.check} aria-hidden>
          <IconCheck />
        </span>
      ) : null}
      <span className={styles.iconWrap}>{icon}</span>
      <span className={styles.copy}>
        <span className={styles.label}>{label}</span>
        {description ? <span className={styles.description}>{description}</span> : null}
      </span>
    </button>
  )
}

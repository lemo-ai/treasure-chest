import styles from './UserAvatar.module.css'

type AvatarSize = 'sm' | 'md' | 'lg'

interface UserAvatarProps {
  size?: AvatarSize
  className?: string
  label?: string
}

/** Local user avatar for chat bubbles (no account system yet). */
export function UserAvatar({
  size = 'sm',
  className,
  label = '我',
}: UserAvatarProps): React.JSX.Element {
  const rootClass = [styles.root, styles[`size_${size}`], className ?? ''].filter(Boolean).join(' ')
  return (
    <span className={rootClass} aria-hidden>
      <span className={styles.letter}>{label.slice(0, 1)}</span>
    </span>
  )
}

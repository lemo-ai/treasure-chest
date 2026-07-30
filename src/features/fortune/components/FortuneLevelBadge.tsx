import { motion } from 'motion/react'
import type { FortuneLevel } from '@shared'
import styles from './FortuneLevelBadge.module.css'

const LEVEL_GLYPH: Record<FortuneLevel, string> = {
  excellent: '✦',
  good: '◈',
  fair: '☯',
  caution: '⚡',
}

interface FortuneLevelBadgeProps {
  level: FortuneLevel
  label: string
  tagline: string
  reducedMotion?: boolean
}

export function FortuneLevelBadge({
  level,
  label,
  tagline,
  reducedMotion = false,
}: FortuneLevelBadgeProps): React.JSX.Element {
  return (
    <motion.div
      className={styles.badge}
      initial={reducedMotion ? false : { opacity: 0, scale: 0.88, rotateX: 18 }}
      animate={{ opacity: 1, scale: 1, rotateX: 0 }}
      transition={{ delay: 0.12, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      whileHover={reducedMotion ? undefined : { scale: 1.04, rotateY: 6 }}
      style={{ transformPerspective: 600, transformStyle: 'preserve-3d' }}
    >
      <span className={styles.borderGlow} aria-hidden />
      <span className={styles.borderSpin} aria-hidden />
      <div className={styles.inner}>
        <span className={styles.glyph} aria-hidden>
          {LEVEL_GLYPH[level]}
        </span>
        <span className={styles.char}>{label}</span>
        <span className={styles.tagline}>{tagline}</span>
      </div>
      {level === 'excellent' ? <span className={styles.sparkA} aria-hidden /> : null}
      {level === 'excellent' ? <span className={styles.sparkB} aria-hidden /> : null}
      {level === 'fair' ? <span className={styles.fairRing} aria-hidden /> : null}
    </motion.div>
  )
}

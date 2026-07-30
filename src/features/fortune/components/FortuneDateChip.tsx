import { motion } from 'motion/react'
import styles from './FortuneDateChip.module.css'

interface FortuneDateChipProps {
  date: string
  locale: string
  label: string
  reducedMotion?: boolean
}

function parseDateParts(date: string, locale: string): {
  year: string
  month: string
  day: string
  monthShort: string
  weekday: string
} {
  const d = new Date(`${date}T12:00:00`)
  const year = String(d.getFullYear())
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const monthShort = new Intl.DateTimeFormat(locale, { month: 'short' }).format(d).toUpperCase()
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(d)
  return { year, month, day, monthShort, weekday }
}

export function FortuneDateChip({
  date,
  locale,
  label,
  reducedMotion = false,
}: FortuneDateChipProps): React.JSX.Element {
  const parts = parseDateParts(date, locale)

  return (
    <motion.time
      className={styles.chip}
      dateTime={date}
      initial={reducedMotion ? false : { opacity: 0, x: -16, rotateY: -12 }}
      animate={{ opacity: 1, x: 0, rotateY: 0 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      whileHover={reducedMotion ? undefined : { scale: 1.02, rotateY: 4 }}
      style={{ transformPerspective: 700, transformStyle: 'preserve-3d' }}
    >
      <span className={styles.scan} aria-hidden />
      <span className={styles.edge} aria-hidden />

      <div className={styles.top}>
        <span className={styles.label}>{label}</span>
        <span className={styles.weekday}>{parts.weekday}</span>
      </div>

      <div className={styles.body}>
        <div className={styles.dayBlock}>
          <span className={styles.dayNum}>{parts.day}</span>
          <span className={styles.daySlash}>/</span>
          <span className={styles.monthNum}>{parts.month}</span>
        </div>
        <div className={styles.meta}>
          <span className={styles.monthShort}>{parts.monthShort}</span>
          <span className={styles.year}>{parts.year}</span>
        </div>
      </div>

      <div className={styles.ticks} aria-hidden>
        {Array.from({ length: 8 }, (_, i) => (
          <span key={i} style={{ '--ti': i } as React.CSSProperties} />
        ))}
      </div>
    </motion.time>
  )
}

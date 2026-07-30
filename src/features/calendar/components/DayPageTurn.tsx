import { AnimatePresence, motion } from 'motion/react'
import styles from './DayPageTurn.module.css'

interface DayPageTurnProps {
  /** Stable key that changes when the calendar day changes (YYYY-MM-DD). */
  pageKey: string
  children: React.ReactNode
  className?: string
}

export function DayPageTurn({ pageKey, children, className }: DayPageTurnProps): React.JSX.Element {
  return (
    <div className={`${styles.stage} ${className ?? ''}`}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={pageKey}
          className={styles.page}
          initial={{ rotateY: -88, opacity: 0.35, scale: 0.98 }}
          animate={{ rotateY: 0, opacity: 1, scale: 1 }}
          exit={{ rotateY: 88, opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

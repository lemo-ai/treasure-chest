import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import styles from './FlipClock.module.css'

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function Digit({ value }: { value: string }): React.JSX.Element {
  const [current, setCurrent] = useState(value)
  const [previous, setPrevious] = useState(value)
  const [phase, setPhase] = useState<'idle' | 'flip'>('idle')
  const currentRef = useRef(value)

  useEffect(() => {
    if (value === currentRef.current) return
    setPrevious(currentRef.current)
    currentRef.current = value
    setCurrent(value)
    setPhase('flip')
    const timer = window.setTimeout(() => setPhase('idle'), 560)
    return () => window.clearTimeout(timer)
  }, [value])

  const flipping = phase === 'flip'

  return (
    <span className={`${styles.digit} ${flipping ? styles.flipping : ''}`}>
      <span className={styles.halfTop} aria-hidden>
        <span className={styles.glyph}>{current}</span>
      </span>
      <span className={styles.halfBottom} aria-hidden>
        <span className={styles.glyph}>{current}</span>
      </span>
      <span className={styles.hinge} aria-hidden />

      {flipping ? (
        <>
          <span className={styles.flapTop} aria-hidden>
            <span className={styles.glyph}>{previous}</span>
          </span>
          <span className={styles.flapBottom} aria-hidden>
            <span className={styles.glyph}>{current}</span>
          </span>
        </>
      ) : null}

      <span className={styles.srOnly}>{current}</span>
    </span>
  )
}

function Pair({ value }: { value: string }): React.JSX.Element {
  return (
    <span className={styles.pair}>
      <Digit value={value[0]} />
      <Digit value={value[1]} />
    </span>
  )
}

export function FlipClock({ now }: { now: Date }): React.JSX.Element {
  const { t } = useTranslation()
  const h = pad2(now.getHours())
  const m = pad2(now.getMinutes())
  const s = pad2(now.getSeconds())

  return (
    <div className={styles.wrap}>
      <div className={styles.label}>{t('calendar.nowTime')}</div>
      <div className={styles.clock} aria-live="polite" aria-label={`${h}:${m}:${s}`}>
        <Pair value={h} />
        <span className={styles.colon} aria-hidden>
          <i />
          <i />
        </span>
        <Pair value={m} />
        <span className={styles.colon} aria-hidden>
          <i />
          <i />
        </span>
        <Pair value={s} />
      </div>
    </div>
  )
}

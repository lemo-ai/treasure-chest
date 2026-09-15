import { useEffect, useLayoutEffect, useRef, useState } from 'react'
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
  const slotRef = useRef<HTMLDivElement>(null)
  const clockRef = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState({ scale: 1, width: 0, height: 0 })

  useLayoutEffect(() => {
    const slot = slotRef.current
    const clock = clockRef.current
    if (!slot || !clock) return

    const measure = (): void => {
      const avail = slot.clientWidth
      if (avail <= 0) return
      const naturalW = clock.scrollWidth
      const naturalH = clock.scrollHeight
      if (naturalW <= 0 || naturalH <= 0) return
      const scale = Math.min(1, avail / naturalW)
      setFit({
        scale,
        width: Math.floor(naturalW * scale),
        height: Math.floor(naturalH * scale),
      })
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(slot)
    return () => ro.disconnect()
  }, [])

  return (
    <div className={styles.wrap}>
      <div className={styles.label}>{t('calendar.nowTime')}</div>
      <div className={styles.slot} ref={slotRef}>
        <div
          className={styles.scaleBox}
          style={
            fit.width > 0
              ? { width: fit.width, height: fit.height }
              : undefined
          }
        >
          <div
            ref={clockRef}
            className={styles.clock}
            style={{ transform: `scale(${fit.scale})` }}
            aria-live="polite"
            aria-label={`${h}:${m}:${s}`}
          >
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
      </div>
    </div>
  )
}

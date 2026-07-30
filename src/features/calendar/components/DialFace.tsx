import { useEffect, useMemo, useState } from 'react'
import type { DaySnapshot, DialFaceStyle } from '@shared'
import styles from './DialFace.module.css'

interface DialFaceProps {
  now: Date
  day: DaySnapshot
  face: DialFaceStyle
  backgroundImageUrl?: string | null
  showTicks?: boolean
  fortuneLine?: string | null
  onExpand: () => void
  onClose: () => void
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function TickMarks(): React.JSX.Element {
  return (
    <svg className={styles.ticksSvg} viewBox="0 0 200 200" aria-hidden>
      {Array.from({ length: 60 }, (_, i) => {
        const major = i % 5 === 0
        const angle = ((i * 6 - 90) * Math.PI) / 180
        const outer = 94
        const inner = major ? 82 : 88
        const x1 = 100 + Math.cos(angle) * outer
        const y1 = 100 + Math.sin(angle) * outer
        const x2 = 100 + Math.cos(angle) * inner
        const y2 = 100 + Math.sin(angle) * inner
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            className={major ? styles.tickLineMajor : styles.tickLineMinor}
          />
        )
      })}
      {Array.from({ length: 12 }, (_, i) => {
        const angle = ((i * 30 - 90) * Math.PI) / 180
        const r = 72
        const x = 100 + Math.cos(angle) * r
        const y = 100 + Math.sin(angle) * r
        const label = i === 0 ? 12 : i
        return (
          <text key={`n-${i}`} x={x} y={y} className={styles.tickNum} textAnchor="middle" dominantBaseline="central">
            {label}
          </text>
        )
      })}
    </svg>
  )
}

function FacePattern(): React.JSX.Element {
  return (
    <svg className={styles.pattern} viewBox="0 0 200 200" aria-hidden>
      <defs>
        <radialGradient id="dialGlow" cx="50%" cy="42%" r="58%">
          <stop offset="0%" stopColor="var(--dial-pattern-strong)" />
          <stop offset="55%" stopColor="var(--dial-pattern)" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        <pattern id="dialGrid" width="14" height="14" patternUnits="userSpaceOnUse">
          <path d="M14 0H0V14" fill="none" stroke="var(--dial-pattern)" strokeWidth="0.7" />
        </pattern>
      </defs>
      <circle cx="100" cy="100" r="96" fill="url(#dialGlow)" />
      <circle cx="100" cy="100" r="90" fill="url(#dialGrid)" opacity="0.55" />
    </svg>
  )
}

export function DialFace({
  now,
  day,
  face,
  backgroundImageUrl,
  showTicks = true,
  fortuneLine,
  onExpand,
  onClose,
}: DialFaceProps): React.JSX.Element {
  const [smooth, setSmooth] = useState(now)
  const [hovered, setHovered] = useState(false)

  useEffect(() => {
    const id = window.setInterval(() => setSmooth(new Date()), 80)
    return () => window.clearInterval(id)
  }, [])

  const angles = useMemo(() => {
    const h = smooth.getHours() % 12
    const m = smooth.getMinutes()
    const s = smooth.getSeconds() + smooth.getMilliseconds() / 1000
    return {
      hour: (h + m / 60) * 30,
      minute: (m + s / 60) * 6,
      second: s * 6,
    }
  }, [smooth])

  const solarLine = `${day.solar.year}年${day.solar.month}月${day.solar.day}日`
  const lunarLine = `${day.lunar.yearGanZhi}年${day.lunar.monthLabel}${day.lunar.dayLabel}`

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return
    const target = event.target as HTMLElement
    if (target.closest('button')) return
    window.treasureChest.startDialDrag()
    const onUp = (): void => {
      window.treasureChest.endDialDrag()
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  return (
    <div
      className={`${styles.root} ${styles[face]} ${hovered ? styles.rootHovered : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onPointerDown={onPointerDown}
    >
      <div className={styles.dialStage}>
        <div className={`${styles.bezel} ${backgroundImageUrl ? styles.bezelPlain : ''}`}>
          <div className={`${styles.face} ${backgroundImageUrl ? styles.faceWithPhoto : ''}`}>
            {backgroundImageUrl ? (
              <div
                className={styles.photo}
                style={{ backgroundImage: `url(${backgroundImageUrl})` }}
              />
            ) : (
              <FacePattern />
            )}
            <div className={styles.scrim} />
            {showTicks ? <TickMarks /> : null}

            <div className={styles.topInfo}>
              <div className={styles.solarYmd}>{solarLine}</div>
              <div className={styles.digital}>
                {pad2(now.getHours())}:{pad2(now.getMinutes())}
                <span className={styles.seconds}>{pad2(now.getSeconds())}</span>
              </div>
            </div>
            <div className={styles.bottomInfo}>
              <div className={styles.lunarYmd}>{lunarLine}</div>
              {fortuneLine ? <div className={styles.fortuneLine}>{fortuneLine}</div> : null}
            </div>

            <span className={styles.handHour} style={{ transform: `rotate(${angles.hour}deg)` }} />
            <span
              className={styles.handMinute}
              style={{ transform: `rotate(${angles.minute}deg)` }}
            />
            <span
              className={styles.handSecond}
              style={{ transform: `rotate(${angles.second}deg)` }}
            />
            <span className={styles.hub} />
          </div>
        </div>
      </div>

      <div className={styles.actionRail}>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={onExpand}
            onPointerDown={(e) => e.stopPropagation()}
            title="展开"
          >
            <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden>
              <path
                d="M9 3.5H3.5V9M15 3.5h5.5V9M9 20.5H3.5V15M15 20.5h5.5V15"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={onClose}
            onPointerDown={(e) => e.stopPropagation()}
            title="关闭"
          >
            <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden>
              <path
                d="M6 6l12 12M18 6L6 18"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

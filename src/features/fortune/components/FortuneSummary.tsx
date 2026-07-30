import { useTranslation } from 'react-i18next'
import type { DailyFortune, FortuneLevel } from '@shared'
import styles from './FortuneSummary.module.css'

/** Six yao lines (bottom → top) derived from hexagram id for a simple glyph. */
export function hexagramLines(id: number): boolean[] {
  const lines: boolean[] = []
  let n = Math.max(1, Math.min(64, id))
  for (let i = 0; i < 6; i++) {
    lines.push(n % 2 === 1)
    n = Math.floor(n / 2)
  }
  return lines.reverse()
}

interface HexagramGlyphProps {
  id: number
  className?: string
}

export function HexagramGlyph({ id, className }: HexagramGlyphProps): React.JSX.Element {
  const lines = hexagramLines(id)
  return (
    <svg className={className} viewBox="0 0 48 56" aria-hidden>
      {lines.map((yang, idx) => {
        const y = 6 + idx * 9
        if (yang) {
          return <rect key={idx} x="6" y={y} width="36" height="4" rx="1.5" fill="currentColor" />
        }
        return (
          <g key={idx}>
            <rect x="6" y={y} width="14" height="4" rx="1.5" fill="currentColor" />
            <rect x="28" y={y} width="14" height="4" rx="1.5" fill="currentColor" />
          </g>
        )
      })}
    </svg>
  )
}

function levelClass(level: FortuneLevel): string {
  return styles[`level_${level}` as keyof typeof styles] ?? ''
}

function MiniScore({ score, level }: { score: number; level: FortuneLevel }): React.JSX.Element {
  const radius = 18
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference

  return (
    <div className={`${styles.miniScore} ${levelClass(level)}`}>
      <svg viewBox="0 0 44 44" aria-hidden>
        <circle className={styles.miniTrack} cx="22" cy="22" r={radius} />
        <circle
          className={styles.miniArc}
          cx="22"
          cy="22"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <span className={styles.miniValue}>{score}</span>
    </div>
  )
}

interface FortuneSummaryProps {
  fortune: DailyFortune
  locale: string
  compact?: boolean
}

export function FortuneSummary({ fortune, locale, compact = false }: FortuneSummaryProps): React.JSX.Element {
  const { t } = useTranslation()
  const aspectKeys = ['career', 'wealth', 'relationship', 'health', 'mood'] as const
  const hexLabel = locale.startsWith('en') ? fortune.hexagram.nameEn : fortune.hexagram.nameFull
  const hexSub = locale.startsWith('en') ? fortune.hexagram.nameFull : fortune.hexagram.nameEn

  return (
    <div className={compact ? `${styles.root} ${styles.compact}` : styles.root}>
      <div className={styles.hero}>
        <div className={styles.seal}>
          <HexagramGlyph id={fortune.hexagram.id} className={styles.glyph} />
          <span className={styles.hexChar}>{fortune.hexagram.name}</span>
        </div>

        <div className={styles.copy}>
          <p className={styles.date}>{fortune.date}</p>
          <h3 className={styles.title}>{hexLabel}</h3>
          <p className={styles.sub}>{hexSub}</p>
          <p className={styles.blurb}>{fortune.overall.blurb}</p>
        </div>

        <MiniScore score={fortune.overall.score} level={fortune.overall.level} />
      </div>

      <blockquote className={styles.advice}>
        <span className={styles.adviceLabel}>{t('fortune.adviceLabel')}</span>
        {fortune.hexagram.advice}
      </blockquote>

      {!compact ? (
        <div className={styles.aspects}>
          {aspectKeys.map((key) => (
            <div key={key} className={styles.aspect}>
              <span className={`${styles.aspectScore} ${levelClass(fortune.aspects[key].level)}`}>
                {fortune.aspects[key].score}
              </span>
              <span className={styles.aspectName}>{t(`fortune.aspect.${key}`)}</span>
              <span className={styles.aspectBlurb}>{fortune.aspects[key].blurb}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

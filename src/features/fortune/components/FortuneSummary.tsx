import type { DailyFortune } from '@shared'

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
          return (
            <rect
              key={idx}
              x="6"
              y={y}
              width="36"
              height="4"
              rx="1.5"
              fill="currentColor"
            />
          )
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

interface FortuneSummaryProps {
  fortune: DailyFortune
  locale: string
  compact?: boolean
}

function levelClass(level: string): string {
  return `fortuneLevel_${level}`
}

export function FortuneSummary({ fortune, locale, compact = false }: FortuneSummaryProps): React.JSX.Element {
  const aspectKeys = ['career', 'wealth', 'relationship', 'health', 'mood'] as const
  const hexLabel = locale.startsWith('en') ? fortune.hexagram.nameEn : fortune.hexagram.nameFull

  return (
    <div className={compact ? 'fortuneSummary compact' : 'fortuneSummary'}>
      <div className="fortuneSummaryHero">
        <HexagramGlyph id={fortune.hexagram.id} className="fortuneSummaryGlyph" />
        <div>
          <h3 className="fortuneSummaryHex">{hexLabel}</h3>
          <p className={`fortuneSummaryScore ${levelClass(fortune.overall.level)}`}>
            {fortune.overall.score}
          </p>
          <p className="fortuneSummaryBlurb">{fortune.overall.blurb}</p>
        </div>
      </div>
      <p className="fortuneSummaryAdvice">{fortune.hexagram.advice}</p>
      {!compact ? (
        <div className="fortuneSummaryAspects">
          {aspectKeys.map((key) => (
            <div key={key} className="fortuneSummaryAspect">
              <span className={`fortuneSummaryAspectScore ${levelClass(fortune.aspects[key].level)}`}>
                {fortune.aspects[key].score}
              </span>
              <span className="fortuneSummaryAspectBlurb">{fortune.aspects[key].blurb}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

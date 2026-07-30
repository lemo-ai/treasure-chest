import { useMemo, useRef, useState } from 'react'
import type { OhlcBar, StocksRangeKey } from '@shared'
import { useTranslation } from 'react-i18next'
import styles from './TrendChart.module.css'

interface TrendChartProps {
  bars: OhlcBar[]
  rangeKey?: StocksRangeKey
}

function sliceBars(bars: OhlcBar[], rangeKey: StocksRangeKey): OhlcBar[] {
  const map: Record<StocksRangeKey, number> = {
    d1: 2,
    w1: 6,
    m1: 23,
    m3: 67,
    m6: 133,
    ytd: bars.length,
    y1: 253,
  }
  if (rangeKey === 'ytd') {
    const year = bars[bars.length - 1]?.date.slice(0, 4)
    if (!year) return bars
    const ytd = bars.filter((b) => b.date.startsWith(year))
    return ytd.length >= 2 ? ytd : bars.slice(-60)
  }
  const n = map[rangeKey]
  return bars.slice(-Math.max(2, n))
}

function fmtPct(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
}

export function TrendChart({ bars, rangeKey = 'm3' }: TrendChartProps): React.JSX.Element | null {
  const { t } = useTranslation()
  const data = useMemo(() => sliceBars(bars, rangeKey), [bars, rangeKey])
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  if (data.length < 2) return null

  const closes = data.map((b) => b.close)
  const min = Math.min(...closes)
  const max = Math.max(...closes)
  const span = max - min || 1
  const w = 560
  const h = 220
  const padX = 12
  const padY = 16

  const points = closes.map((v, i) => {
    const x = padX + (i / (closes.length - 1)) * (w - padX * 2)
    const y = h - padY - ((v - min) / span) * (h - padY * 2)
    return { x, y }
  })
  const poly = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const area = `${padX},${h - padY} ${poly} ${w - padX},${h - padY}`
  const up = closes[closes.length - 1]! >= closes[0]!
  const changePct = ((closes[closes.length - 1]! - closes[0]!) / closes[0]!) * 100
  const firstDate = data[0]!.date
  const lastDate = data[data.length - 1]!.date

  const activeIdx = hoverIdx ?? points.length - 1
  const active = data[activeIdx]!
  const activePoint = points[activeIdx]!
  const prev = data[Math.max(0, activeIdx - 1)]!
  const dayChange = ((active.close - prev.close) / prev.close) * 100
  const vsStart = ((active.close - data[0]!.close) / data[0]!.close) * 100

  const onMove = (e: React.MouseEvent<SVGSVGElement>): void => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * w
    let best = 0
    let bestDist = Number.POSITIVE_INFINITY
    for (let i = 0; i < points.length; i++) {
      const d = Math.abs(points[i]!.x - x)
      if (d < bestDist) {
        bestDist = d
        best = i
      }
    }
    setHoverIdx(best)
  }

  const tooltipLeft = Math.min(Math.max((activePoint.x / w) * 100, 12), 88)

  return (
    <div className={styles.wrap}>
      <div className={styles.meta}>
        <span>{t(`stocks.range.${rangeKey}`)}</span>
        <span className={up ? styles.up : styles.down}>
          {changePct >= 0 ? '+' : ''}
          {changePct.toFixed(2)}%
        </span>
        <span className={styles.dates}>
          {firstDate} → {lastDate}
        </span>
      </div>

      <div className={styles.chartBox}>
        <svg
          ref={svgRef}
          className={`${styles.svg} ${up ? styles.up : styles.down}`}
          viewBox={`0 0 ${w} ${h}`}
          role="img"
          onMouseMove={onMove}
          onMouseLeave={() => setHoverIdx(null)}
        >
          <defs>
            <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <line x1={padX} x2={w - padX} y1={h / 2} y2={h / 2} className={styles.grid} />
          <polygon points={area} fill="url(#trendFill)" />
          <polyline
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinejoin="round"
            strokeLinecap="round"
            points={poly}
          />

          {hoverIdx !== null ? (
            <>
              <line
                x1={activePoint.x}
                x2={activePoint.x}
                y1={padY}
                y2={h - padY}
                className={styles.crosshair}
              />
              <line
                x1={padX}
                x2={w - padX}
                y1={activePoint.y}
                y2={activePoint.y}
                className={styles.crosshair}
              />
            </>
          ) : null}

          <circle cx={activePoint.x} cy={activePoint.y} r={hoverIdx !== null ? 4.5 : 3.5} fill="currentColor" />
          {/* invisible hit area */}
          <rect x={0} y={0} width={w} height={h} fill="transparent" />
        </svg>

        {hoverIdx !== null ? (
          <div className={styles.tooltip} style={{ left: `${tooltipLeft}%` }}>
            <div className={styles.tipDate}>{active.date}</div>
            <div className={styles.tipPrice}>
              {t('stocks.trendClosePrice')}: <strong>{active.close.toFixed(2)}</strong>
            </div>
            <div className={styles.tipRow}>
              {t('stocks.trendOpen')}: {active.open.toFixed(2)}
            </div>
            <div className={styles.tipRow}>
              {t('stocks.trendHigh')}: {active.high.toFixed(2)} · {t('stocks.trendLow')}: {active.low.toFixed(2)}
            </div>
            <div className={`${styles.tipRow} ${dayChange >= 0 ? styles.up : styles.down}`}>
              {t('stocks.trendDayChange')}: {fmtPct(dayChange)}
            </div>
            <div className={`${styles.tipRow} ${vsStart >= 0 ? styles.up : styles.down}`}>
              {t('stocks.trendVsStart')}: {fmtPct(vsStart)}
            </div>
          </div>
        ) : (
          <p className={styles.hoverHint}>{t('stocks.trendHoverHint')}</p>
        )}
      </div>

      <div className={styles.axis}>
        <span>{min.toFixed(2)}</span>
        <span>{max.toFixed(2)}</span>
      </div>
    </div>
  )
}

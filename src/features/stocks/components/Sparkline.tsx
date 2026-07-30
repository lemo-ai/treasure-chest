import styles from './Sparkline.module.css'

interface SparklineProps {
  values: number[]
  className?: string
}

export function Sparkline({ values, className }: SparklineProps): React.JSX.Element | null {
  if (!values || values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const w = 120
  const h = 36
  const pad = 2
  const points = values
    .map((v, i) => {
      const x = pad + (i / (values.length - 1)) * (w - pad * 2)
      const y = h - pad - ((v - min) / span) * (h - pad * 2)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  const up = values[values.length - 1]! >= values[0]!

  return (
    <svg
      className={`${styles.svg} ${up ? styles.up : styles.down} ${className ?? ''}`}
      viewBox={`0 0 ${w} ${h}`}
      width={w}
      height={h}
      aria-hidden
    >
      <polyline fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" points={points} />
    </svg>
  )
}

import { useMemo } from 'react'
import styles from './BirthDatePicker.module.css'

const YEAR_START = 1940
const YEAR_END = new Date().getFullYear()

function parseYmd(value: string): { y: number; m: number; d: number } {
  const [y, m, d] = value.split('-').map(Number)
  return { y: y || YEAR_END - 30, m: m || 1, d: d || 1 }
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

function toYmd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

interface BirthDatePickerProps {
  value: string
  onChange: (ymd: string) => void
  yearLabel: string
  monthLabel: string
  dayLabel: string
}

export function BirthDatePicker({
  value,
  onChange,
  yearLabel,
  monthLabel,
  dayLabel,
}: BirthDatePickerProps): React.JSX.Element {
  const { y, m, d } = parseYmd(value)

  const years = useMemo(() => {
    const list: number[] = []
    for (let year = YEAR_END; year >= YEAR_START; year--) list.push(year)
    return list
  }, [])

  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), [])

  const days = useMemo(() => {
    const max = daysInMonth(y, m)
    return Array.from({ length: max }, (_, i) => i + 1)
  }, [y, m])

  const safeDay = Math.min(d, daysInMonth(y, m))

  const patch = (nextY: number, nextM: number, nextD: number): void => {
    const clampedDay = Math.min(nextD, daysInMonth(nextY, nextM))
    onChange(toYmd(nextY, nextM, clampedDay))
  }

  return (
    <div className={styles.root}>
      <label className={styles.part}>
        <span className={styles.partLabel}>{yearLabel}</span>
        <select
          className={styles.select}
          value={y}
          onChange={(e) => patch(Number(e.target.value), m, safeDay)}
        >
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.part}>
        <span className={styles.partLabel}>{monthLabel}</span>
        <select
          className={styles.select}
          value={m}
          onChange={(e) => patch(y, Number(e.target.value), safeDay)}
        >
          {months.map((month) => (
            <option key={month} value={month}>
              {month}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.part}>
        <span className={styles.partLabel}>{dayLabel}</span>
        <select
          className={styles.select}
          value={safeDay}
          onChange={(e) => patch(y, m, Number(e.target.value))}
        >
          {days.map((day) => (
            <option key={day} value={day}>
              {day}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

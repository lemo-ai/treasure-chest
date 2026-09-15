import { useTranslation } from 'react-i18next'
import type { MonthSnapshot, WorkDayInfo } from '@shared'
import styles from './MonthGrid.module.css'

const WEEK_HEADERS = ['日', '一', '二', '三', '四', '五', '六']

interface MonthGridProps {
  month: MonthSnapshot
  selectedDate: string
  onSelect: (date: string) => void
}

function workBadge(workDay: WorkDayInfo): { labelKey: string; className: string } | null {
  if (workDay.kind === 'rest') {
    return { labelKey: 'calendar.workBadgeRest', className: styles.badgeRest }
  }
  if (workDay.kind === 'makeup') {
    return { labelKey: 'calendar.workBadgeWork', className: styles.badgeWork }
  }
  return null
}

export function MonthGrid({ month, selectedDate, onSelect }: MonthGridProps): React.JSX.Element {
  const { t } = useTranslation()

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        {t('calendar.monthTitle', { year: month.year, month: month.month })}
      </div>
      <div className={styles.weekHead}>
        {WEEK_HEADERS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className={styles.grid}>
        {month.cells.map((cell) => {
          const selected = cell.date === selectedDate
          const badge = workBadge(cell.workDay)
          const className = [
            styles.cell,
            cell.inMonth ? '' : styles.out,
            cell.isToday ? styles.today : '',
            selected ? styles.selected : '',
            cell.workDay.kind === 'rest' ? styles.restDay : '',
            cell.workDay.kind === 'makeup' ? styles.makeupDay : '',
          ]
            .filter(Boolean)
            .join(' ')
          return (
            <button
              key={cell.date}
              type="button"
              className={className}
              onClick={() => onSelect(cell.date)}
            >
              {badge ? (
                <span className={`${styles.badge} ${badge.className}`}>{t(badge.labelKey)}</span>
              ) : null}
              <span className={styles.dayNum}>{cell.day}</span>
              <span className={styles.lunar}>{cell.jieQi || cell.festivals[0] || cell.lunarDayLabel}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

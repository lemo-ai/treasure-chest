import { useTranslation } from 'react-i18next'
import type { DaySnapshot } from '@shared'
import { FlipClock } from './FlipClock'
import styles from './DayBoard.module.css'

interface DayBoardProps {
  day: DaySnapshot
  now: Date
  compact?: boolean
  dense?: boolean
}

export function DayBoard({
  day,
  now,
  compact = false,
  dense = false,
}: DayBoardProps): React.JSX.Element {
  const { t } = useTranslation()
  const rootClass = [
    compact ? styles.compact : styles.board,
    dense ? styles.dense : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={rootClass}>
      <div className={styles.hero}>
        <div className={styles.solarDay}>{day.solar.day}</div>
        <div className={styles.solarMeta}>
          <div className={styles.ymd}>
            {day.solar.year}.{String(day.solar.month).padStart(2, '0')}
          </div>
          <div className={styles.week}>
            {t('calendar.weekday', { day: day.solar.weekLabel })} ·{' '}
            {t('calendar.weekOfYear', { n: day.solar.weekOfYear })}
          </div>
        </div>
      </div>

      <FlipClock now={now} />

      <div className={styles.lunar}>
        <span>
          {t('calendar.lunarLine', {
            year: day.lunar.yearLabel,
            month: day.lunar.monthLabel,
            day: day.lunar.dayLabel,
            animal: day.lunar.animal,
          })}
        </span>
        <span className={styles.ganzhi}>
          {day.lunar.yearGanZhi} · {day.lunar.monthGanZhi} · {day.lunar.dayGanZhi}
        </span>
      </div>

      {(day.festivals.length > 0 || day.jieQi) && (
        <div className={styles.tags}>
          {day.jieQi ? <span className={styles.tagJie}>{day.jieQi}</span> : null}
          {day.festivals.map((f) => (
            <span key={f} className={styles.tag}>
              {f}
            </span>
          ))}
        </div>
      )}

      {day.nextJieQi ? (
        <p className={styles.nextJie}>
          {t('calendar.nextJieQi', {
            name: day.nextJieQi.name,
            days: day.nextJieQi.daysUntil,
            date: day.nextJieQi.date,
          })}
        </p>
      ) : null}

      <div className={styles.yiJi}>
        <div>
          <h3 className={styles.yiTitle}>{t('calendar.yi')}</h3>
          <p className={styles.yiText}>{day.yi.join('、') || '—'}</p>
        </div>
        <div>
          <h3 className={styles.jiTitle}>{t('calendar.ji')}</h3>
          <p className={styles.jiText}>{day.ji.join('、') || '—'}</p>
        </div>
      </div>
    </div>
  )
}

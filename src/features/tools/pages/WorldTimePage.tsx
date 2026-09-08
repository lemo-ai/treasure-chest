import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { useTranslation } from 'react-i18next'
import { ToolShell } from '../components/ToolShell'
import { FEATURED_CITIES, WORLD_CITIES, type WorldCity } from '../lib/cities'
import styles from './WorldTimePage.module.css'

dayjs.extend(utc)
dayjs.extend(timezone)

function cityName(city: WorldCity, lang: string): string {
  return lang.startsWith('zh') ? city.cityZh : city.cityEn
}

function countryName(city: WorldCity, lang: string): string {
  return lang.startsWith('zh') ? city.countryZh : city.countryEn
}

export function WorldTimePage(): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const lang = i18n.language || 'zh-CN'
  const [now, setNow] = useState(() => dayjs())
  const [query, setQuery] = useState('')

  useEffect(() => {
    const timer = window.setInterval(() => setNow(dayjs()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return WORLD_CITIES
    return WORLD_CITIES.filter((city) => {
      const hay = [
        city.cityZh,
        city.cityEn,
        city.countryZh,
        city.countryEn,
        city.timezone,
      ]
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [query])

  const formatDiff = (tz: string): string => {
    const beijing = now.tz('Asia/Shanghai')
    const target = now.tz(tz)
    const diffHours = (target.utcOffset() - beijing.utcOffset()) / 60
    if (diffHours === 0) return t('tools.worldtime.diffSame')
    if (diffHours > 0) return t('tools.worldtime.diffAhead', { hours: diffHours })
    return t('tools.worldtime.diffBehind', { hours: Math.abs(diffHours) })
  }

  const weekday = (tz: string): string => {
    const day = now.tz(tz).day()
    return t(`tools.worldtime.weekday.${day}`)
  }

  return (
    <ToolShell title={t('tools.worldtime.title')} subtitle={t('tools.worldtime.desc')}>
      <div className={styles.featured}>
        {FEATURED_CITIES.map((city) => {
          const local = now.tz(city.timezone)
          return (
            <article key={city.id} className={styles.featureCard}>
              <div className={styles.flag}>{city.flag}</div>
              <div className={styles.country}>{countryName(city, lang)}</div>
              <div className={styles.city}>{cityName(city, lang)}</div>
              <div className={styles.clock}>{local.format('HH:mm:ss')}</div>
              <div className={styles.meta}>
                {local.format('YYYY-MM-DD')} · {weekday(city.timezone)}
              </div>
              <div className={styles.diff}>{formatDiff(city.timezone)}</div>
            </article>
          )
        })}
      </div>

      <label className={styles.search}>
        <span className={styles.searchLabel}>{t('tools.worldtime.search')}</span>
        <input
          className={styles.searchInput}
          value={query}
          placeholder={t('tools.worldtime.searchPlaceholder')}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>

      <div className={styles.list}>
        {filtered.map((city) => {
          const local = now.tz(city.timezone)
          return (
            <div key={city.id} className={styles.row}>
              <div className={styles.rowLeft}>
                <span className={styles.rowFlag}>{city.flag}</span>
                <span className={styles.rowCity}>{cityName(city, lang)}</span>
                <span className={styles.rowCountry}>{countryName(city, lang)}</span>
              </div>
              <div className={styles.rowRight}>
                {local.format('YYYY-MM-DD HH:mm:ss')} · {weekday(city.timezone)}
              </div>
            </div>
          )
        })}
        {filtered.length === 0 ? (
          <p className={styles.empty}>{t('tools.worldtime.empty')}</p>
        ) : null}
      </div>
    </ToolShell>
  )
}

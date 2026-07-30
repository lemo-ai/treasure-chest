import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { DesktopWidgetView } from '@shared'
import { DEFAULT_DESKTOP_WIDGET } from '@shared'
import { useDaySnapshot } from '@renderer/features/calendar/hooks/useCalendarData'
import { useNowTick } from '@renderer/features/calendar/hooks/useNowTick'
import {
  IconArrowRight,
  IconCalendar,
  IconFortune,
  IconOpenWindow,
  IconSettings,
  IconStocks,
} from '@renderer/shared/ui/icons'
import styles from './HomePage.module.css'

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function HomePage(): React.JSX.Element {
  const { t } = useTranslation()
  const now = useNowTick()
  const day = useDaySnapshot()
  const [version, setVersion] = useState('')
  const [widget, setWidget] = useState<DesktopWidgetView>({
    ...DEFAULT_DESKTOP_WIDGET,
    backgroundImageUrl: null,
  })

  useEffect(() => {
    void window.treasureChest.getVersion().then(setVersion)
    void window.treasureChest.getDesktopWidget().then(setWidget)
  }, [])

  const modules = [
    {
      to: '/calendar',
      icon: <IconCalendar />,
      title: t('home.card.calendar.title'),
      desc: t('home.card.calendar.desc'),
      tone: styles.toneBrand,
    },
    {
      to: '/fortune',
      icon: <IconFortune />,
      title: t('home.card.fortune.title'),
      desc: t('home.card.fortune.desc'),
      tone: styles.toneAccent,
    },
    {
      to: '/stocks',
      icon: <IconStocks />,
      title: t('home.card.stocks.title'),
      desc: t('home.card.stocks.desc'),
      tone: styles.toneHighlight,
    },
  ] as const

  return (
    <section className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.greeting}>{t('home.greeting')}</p>
          <h1 className={styles.title}>{t('home.title')}</h1>
          <p className={styles.subtitle}>{t('home.subtitle')}</p>
        </div>
        <div className={styles.heroClock} aria-live="polite">
          <div className={styles.clockTime}>
            {pad2(now.getHours())}:{pad2(now.getMinutes())}
            <span className={styles.clockSec}>{pad2(now.getSeconds())}</span>
          </div>
          <div className={styles.clockDate}>
            {day.solar.year}.{pad2(day.solar.month)}.{pad2(day.solar.day)} ·{' '}
            {t('calendar.weekday', { day: day.solar.weekLabel })}
          </div>
        </div>
      </header>

      <div className={styles.todayCard}>
        <div className={styles.todayMain}>
          <div className={styles.todayDay}>{day.solar.day}</div>
          <div className={styles.todayMeta}>
            <div className={styles.todayLunar}>
              {t('calendar.lunarLine', {
                year: day.lunar.yearLabel,
                month: day.lunar.monthLabel,
                day: day.lunar.dayLabel,
                animal: day.lunar.animal,
              })}
            </div>
            <div className={styles.todayGan}>
              {day.lunar.yearGanZhi} · {day.lunar.monthGanZhi} · {day.lunar.dayGanZhi}
            </div>
            {day.jieQi || day.festivals.length > 0 ? (
              <div className={styles.todayTags}>
                {day.jieQi ? <span className={styles.tagJie}>{day.jieQi}</span> : null}
                {day.festivals.slice(0, 3).map((f) => (
                  <span key={f} className={styles.tag}>
                    {f}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className={styles.yiJi}>
          <div>
            <h3 className={styles.yiTitle}>{t('calendar.yi')}</h3>
            <p className={styles.yiText}>{day.yi.slice(0, 4).join('、') || '—'}</p>
          </div>
          <div>
            <h3 className={styles.jiTitle}>{t('calendar.ji')}</h3>
            <p className={styles.jiText}>{day.ji.slice(0, 4).join('、') || '—'}</p>
          </div>
        </div>

        <div className={styles.todayActions}>
          <Link to="/calendar" className={styles.primaryLink}>
            {t('home.openCalendarPage')}
            <IconArrowRight />
          </Link>
        </div>
      </div>

      <div className={styles.moduleGrid}>
        {modules.map((m) => (
          <Link key={m.to} to={m.to} className={styles.moduleCard}>
            <span className={`${styles.moduleIcon} ${m.tone}`}>{m.icon}</span>
            <div className={styles.moduleBody}>
              <h2 className={styles.moduleTitle}>{m.title}</h2>
              <p className={styles.moduleDesc}>{m.desc}</p>
            </div>
            <span className={styles.moduleArrow}>
              <IconArrowRight />
            </span>
          </Link>
        ))}
      </div>

      <div className={styles.widgetBar}>
        <div className={styles.widgetCopy}>
          <h2 className={styles.widgetTitle}>{t('home.widget.title')}</h2>
          <p className={styles.widgetDesc}>
            {widget.enabled ? t('home.widget.on') : t('home.widget.off')}
          </p>
        </div>
        <div className={styles.widgetActions}>
          <button
            type="button"
            className={styles.ghostBtn}
            onClick={() => void window.treasureChest.openCalendarWindow()}
          >
            <IconOpenWindow />
            {t('home.widget.open')}
          </button>
          <Link to="/settings" className={styles.ghostBtn}>
            <IconSettings />
            {t('home.configureWidget')}
          </Link>
        </div>
      </div>

      {version ? <p className={styles.meta}>{t('home.version', { version })}</p> : null}
    </section>
  )
}

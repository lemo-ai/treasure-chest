import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { CalendarMode, DialFaceStyle } from '@shared'
import { DEFAULT_DESKTOP_WIDGET } from '@shared'
import { useNowTick } from '../hooks/useNowTick'
import { useDaySnapshot, useMonthSnapshot } from '../hooks/useCalendarData'
import { DayBoard } from '../components/DayBoard'
import { MonthGrid } from '../components/MonthGrid'
import { DialFace } from '../components/DialFace'
import { parseYmd } from '../lib/CalendarService'
import { useTheme } from '@renderer/shared/hooks/useTheme'
import { IconButton } from '@renderer/shared/ui/IconButton'
import {
  IconChevronLeft,
  IconChevronRight,
  IconClose,
  IconCompress,
  IconToday,
} from '@renderer/shared/ui/icons'
import styles from './CalendarPage.module.css'

function todayYmd(): string {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

export function CalendarPage(): React.JSX.Element {
  const { t } = useTranslation()
  const now = useNowTick()
  const [selected, setSelected] = useState(todayYmd)
  const selectedDate = useMemo(() => parseYmd(selected), [selected])
  const day = useDaySnapshot(selected)
  const month = useMonthSnapshot(selectedDate.getFullYear(), selectedDate.getMonth() + 1)

  const shiftMonth = (delta: number): void => {
    const d = parseYmd(selected)
    d.setMonth(d.getMonth() + delta)
    setSelected(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    )
  }

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{t('calendar.title')}</h1>
          <p className={styles.subtitle}>{t('calendar.pageSubtitle')}</p>
        </div>
        <div className={styles.actions}>
          <IconButton
            icon={<IconChevronLeft />}
            label={t('calendar.prevMonth')}
            onClick={() => shiftMonth(-1)}
          />
          <IconButton
            icon={<IconToday />}
            label={t('calendar.today')}
            onClick={() => setSelected(todayYmd())}
          />
          <IconButton
            icon={<IconChevronRight />}
            label={t('calendar.nextMonth')}
            onClick={() => shiftMonth(1)}
          />
        </div>
      </header>

      <div className={styles.layout}>
        <div className={styles.panel}>
          <DayBoard day={day} now={now} />
        </div>
        <MonthGrid month={month} selectedDate={selected} onSelect={setSelected} />
      </div>
    </section>
  )
}

export function CalendarStandalonePage(): React.JSX.Element {
  const { t } = useTranslation()
  useTheme()
  const now = useNowTick()
  const [mode, setMode] = useState<CalendarMode>('widget')
  const [dialFace, setDialFace] = useState<DialFaceStyle>(DEFAULT_DESKTOP_WIDGET.dialFace)
  const [backgroundImageUrl, setBackgroundImageUrl] = useState<string | null>(null)
  const [showTicks, setShowTicks] = useState(DEFAULT_DESKTOP_WIDGET.showTicks)
  const [selected, setSelected] = useState(todayYmd)
  const day = useDaySnapshot(selected)

  useEffect(() => {
    document.documentElement.classList.add('calendar-float-root')
    document.body.classList.add('calendar-float-body')
    return () => {
      document.documentElement.classList.remove('calendar-float-root')
      document.body.classList.remove('calendar-float-body')
    }
  }, [])

  useEffect(() => {
    void window.treasureChest.getCalendarMode().then(setMode)
    void window.treasureChest.getDesktopWidget().then((w) => {
      setDialFace(w.dialFace)
      setBackgroundImageUrl(w.backgroundImageUrl)
      setShowTicks(w.showTicks)
    })
    return window.treasureChest.onDesktopWidgetUpdated((w) => {
      setDialFace(w.dialFace)
      setBackgroundImageUrl(w.backgroundImageUrl)
      setShowTicks(w.showTicks)
    })
  }, [])

  useEffect(() => {
    const id = window.setInterval(() => {
      setSelected((prev) => {
        const ymd = todayYmd()
        return prev === ymd ? ymd : prev
      })
    }, 60_000)
    return () => window.clearInterval(id)
  }, [])

  const onToggleMode = async (): Promise<void> => {
    const next: CalendarMode = mode === 'widget' ? 'large' : 'widget'
    const applied = await window.treasureChest.setCalendarMode(next)
    setMode(applied)
  }

  const onClose = (): void => {
    void window.treasureChest.closeCalendarWindow()
  }

  if (mode === 'widget') {
    return (
      <div className={`calendar-mode-widget ${styles.dialRoot}`}>
        <DialFace
          now={now}
          day={day}
          face={dialFace}
          backgroundImageUrl={backgroundImageUrl}
          showTicks={showTicks}
          onExpand={() => void onToggleMode()}
          onClose={onClose}
        />
      </div>
    )
  }

  return (
    <div className={`${styles.standalone} calendar-mode-large`}>
      <div className={styles.toolbar}>
        <span className={styles.toolbarTitle}>{t('calendar.title')}</span>
        <div className={styles.floatActions}>
          <IconButton
            icon={<IconCompress />}
            label={t('calendar.switchWidget')}
            variant="soft"
            onClick={() => void onToggleMode()}
          />
          <IconButton
            icon={<IconClose />}
            label={t('calendar.closeWidget')}
            variant="soft"
            onClick={onClose}
          />
        </div>
      </div>

      <div className={styles.expandedBody}>
        <DayBoard day={day} now={now} compact dense />
      </div>
    </div>
  )
}

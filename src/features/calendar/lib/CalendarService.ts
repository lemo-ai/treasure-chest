import { Solar, SolarMonth } from 'lunar-javascript'
import type { DaySnapshot, MonthCell, MonthSnapshot } from '@shared'

const WEEK_LABELS_ZH = ['日', '一', '二', '三', '四', '五', '六']

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function toYmd(solar: { getYear(): number; getMonth(): number; getDay(): number }): string {
  return `${solar.getYear()}-${pad(solar.getMonth())}-${pad(solar.getDay())}`
}

function diffDays(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate())
  return Math.round((b - a) / 86400000)
}

function buildFestivals(solar: ReturnType<typeof Solar.fromYmd>, lunar: ReturnType<Solar['getLunar']>): string[] {
  const list = [
    ...solar.getFestivals(),
    ...solar.getOtherFestivals(),
    ...lunar.getFestivals(),
    ...lunar.getOtherFestivals(),
  ]
  return [...new Set(list.filter(Boolean))]
}

export function getDaySnapshot(date: Date = new Date()): DaySnapshot {
  const solar = Solar.fromYmd(date.getFullYear(), date.getMonth() + 1, date.getDate())
  const lunar = solar.getLunar()
  const week = solar.getWeek()
  const solarWeek = solar.getSolarWeek(1)
  const jieQiName = lunar.getJieQi() || null

  const nextJq = lunar.getNextJieQi()
  let nextJieQi: DaySnapshot['nextJieQi'] = null
  if (nextJq) {
    const jqSolar = nextJq.getSolar()
    const jqDate = new Date(jqSolar.getYear(), jqSolar.getMonth() - 1, jqSolar.getDay())
    nextJieQi = {
      name: nextJq.getName(),
      date: toYmd(jqSolar),
      daysUntil: diffDays(date, jqDate),
    }
  }

  return {
    date: toYmd(solar),
    solar: {
      year: solar.getYear(),
      month: solar.getMonth(),
      day: solar.getDay(),
      week,
      weekLabel: WEEK_LABELS_ZH[week] ?? String(week),
      weekOfYear: solarWeek.getIndex(),
    },
    lunar: {
      yearLabel: lunar.getYearInChinese(),
      monthLabel: lunar.getMonthInChinese(),
      dayLabel: lunar.getDayInChinese(),
      yearGanZhi: lunar.getYearInGanZhi(),
      monthGanZhi: lunar.getMonthInGanZhi(),
      dayGanZhi: lunar.getDayInGanZhi(),
      animal: lunar.getYearShengXiao(),
    },
    festivals: buildFestivals(solar, lunar),
    jieQi: jieQiName,
    nextJieQi,
    yi: lunar.getDayYi().slice(0, 8),
    ji: lunar.getDayJi().slice(0, 8),
  }
}

export function getMonthSnapshot(year: number, month: number, today = new Date()): MonthSnapshot {
  const monthObj = SolarMonth.fromYm(year, month)
  const days = monthObj.getDays()
  const first = days[0]
  const firstWeek = first.getWeek() // 0=Sun
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`

  const cells: MonthCell[] = []

  // Leading days from previous month
  for (let i = 0; i < firstWeek; i++) {
    const d = first.next(i - firstWeek)
    const lunar = d.getLunar()
    cells.push({
      date: toYmd(d),
      day: d.getDay(),
      inMonth: false,
      isToday: toYmd(d) === todayStr,
      lunarDayLabel: lunar.getDayInChinese(),
      festivals: buildFestivals(d, lunar).slice(0, 1),
      jieQi: lunar.getJieQi() || null,
    })
  }

  for (const d of days) {
    const lunar = d.getLunar()
    cells.push({
      date: toYmd(d),
      day: d.getDay(),
      inMonth: true,
      isToday: toYmd(d) === todayStr,
      lunarDayLabel: lunar.getDayInChinese(),
      festivals: buildFestivals(d, lunar).slice(0, 1),
      jieQi: lunar.getJieQi() || null,
    })
  }

  // Trailing to fill 6x7
  while (cells.length < 42) {
    const last = cells[cells.length - 1]
    const [y, m, day] = last.date.split('-').map(Number)
    const solar = Solar.fromYmd(y, m, day).next(1)
    const lunar = solar.getLunar()
    cells.push({
      date: toYmd(solar),
      day: solar.getDay(),
      inMonth: false,
      isToday: toYmd(solar) === todayStr,
      lunarDayLabel: lunar.getDayInChinese(),
      festivals: buildFestivals(solar, lunar).slice(0, 1),
      jieQi: lunar.getJieQi() || null,
    })
  }

  return { year, month, cells }
}

export function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d)
}

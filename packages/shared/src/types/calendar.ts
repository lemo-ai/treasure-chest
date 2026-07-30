export type CalendarMode = 'widget' | 'large'

export interface DaySnapshot {
  /** YYYY-MM-DD */
  date: string
  solar: {
    year: number
    month: number
    day: number
    week: number
    weekLabel: string
    weekOfYear: number
  }
  lunar: {
    yearLabel: string
    monthLabel: string
    dayLabel: string
    yearGanZhi: string
    monthGanZhi: string
    dayGanZhi: string
    animal: string
  }
  festivals: string[]
  jieQi: string | null
  nextJieQi: { name: string; date: string; daysUntil: number } | null
  yi: string[]
  ji: string[]
}

export interface MonthCell {
  date: string
  day: number
  inMonth: boolean
  isToday: boolean
  lunarDayLabel: string
  festivals: string[]
  jieQi: string | null
}

export interface MonthSnapshot {
  year: number
  month: number
  /** Sunday-first grid, 6 weeks × 7 */
  cells: MonthCell[]
}

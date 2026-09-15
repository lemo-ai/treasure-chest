export type CalendarMode = 'widget' | 'large'

/** CN work calendar: workday / rest / makeup (调休上班). */
export type WorkDayKind = 'work' | 'rest' | 'makeup'

export interface WorkDayInfo {
  /** True when this day requires going to work. */
  isWorkday: boolean
  kind: WorkDayKind
  /** Official holiday name when this day is part of a statutory schedule. */
  holidayName: string | null
}

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
  workDay: WorkDayInfo
}

export interface MonthCell {
  date: string
  day: number
  inMonth: boolean
  isToday: boolean
  lunarDayLabel: string
  festivals: string[]
  jieQi: string | null
  workDay: WorkDayInfo
}

export interface MonthSnapshot {
  year: number
  month: number
  /** Sunday-first grid, 6 weeks × 7 */
  cells: MonthCell[]
}

import { useMemo } from 'react'
import { getDaySnapshot, getMonthSnapshot, parseYmd } from '../lib/CalendarService'
import type { DaySnapshot, MonthSnapshot } from '@shared'

export function useDaySnapshot(dateYmd?: string): DaySnapshot {
  return useMemo(() => {
    const d = dateYmd ? parseYmd(dateYmd) : new Date()
    return getDaySnapshot(d)
  }, [dateYmd])
}

export function useMonthSnapshot(year: number, month: number): MonthSnapshot {
  return useMemo(() => getMonthSnapshot(year, month), [year, month])
}

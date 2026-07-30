import type { StockMarket } from './stocks'

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** YYYY-MM-DD in local calendar (or explicit y/m/d). */
export function toYmd(date: Date | string): string {
  if (typeof date === 'string') return date.slice(0, 10)
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function parseYmd(ymd: string): { y: number; m: number; d: number } {
  const [y, m, d] = ymd.split('-').map(Number)
  return { y: y!, m: m!, d: d! }
}

function weekdayOf(ymd: string): number {
  const { y, m, d } = parseYmd(ymd)
  return new Date(y, m - 1, d).getDay()
}

function isWeekend(ymd: string): boolean {
  const w = weekdayOf(ymd)
  return w === 0 || w === 6
}

function expandRange(start: string, end: string): string[] {
  const out: string[] = []
  const a = parseYmd(start)
  const b = parseYmd(end)
  let cur = new Date(a.y, a.m - 1, a.d)
  const last = new Date(b.y, b.m - 1, b.d)
  while (cur <= last) {
    out.push(`${cur.getFullYear()}-${pad2(cur.getMonth() + 1)}-${pad2(cur.getDate())}`)
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1)
  }
  return out
}

function nthWeekday(year: number, month: number, weekday: number, n: number): string {
  // month 1-12; weekday 0=Sun..6=Sat; n=1 first, -1 last
  if (n > 0) {
    const first = new Date(year, month - 1, 1)
    const offset = (weekday - first.getDay() + 7) % 7
    const day = 1 + offset + (n - 1) * 7
    return `${year}-${pad2(month)}-${pad2(day)}`
  }
  const last = new Date(year, month, 0)
  const offset = (last.getDay() - weekday + 7) % 7
  const day = last.getDate() - offset
  return `${year}-${pad2(month)}-${pad2(day)}`
}

function observeFixed(year: number, month: number, day: number): string {
  const ymd = `${year}-${pad2(month)}-${pad2(day)}`
  const w = weekdayOf(ymd)
  if (w === 6) {
    // Saturday → Friday
    const dt = new Date(year, month - 1, day - 1)
    return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`
  }
  if (w === 0) {
    // Sunday → Monday
    const dt = new Date(year, month - 1, day + 1)
    return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`
  }
  return ymd
}

/** Official A-share holiday closures (weekends still closed separately). */
const CN_HOLIDAY_RANGES: Array<[string, string, string]> = [
  // 2025
  ['2025-01-01', '2025-01-01', '元旦'],
  ['2025-01-28', '2025-02-04', '春节'],
  ['2025-04-04', '2025-04-06', '清明节'],
  ['2025-05-01', '2025-05-05', '劳动节'],
  ['2025-05-31', '2025-06-02', '端午节'],
  ['2025-10-01', '2025-10-08', '国庆/中秋'],
  // 2026 (SSE/SZSE announcement)
  ['2026-01-01', '2026-01-03', '元旦'],
  ['2026-02-15', '2026-02-23', '春节'],
  ['2026-04-04', '2026-04-06', '清明节'],
  ['2026-05-01', '2026-05-05', '劳动节'],
  ['2026-06-19', '2026-06-21', '端午节'],
  ['2026-09-25', '2026-09-27', '中秋节'],
  ['2026-10-01', '2026-10-07', '国庆节'],
]

const CN_HOLIDAY_MAP = new Map<string, string>()
for (const [start, end, name] of CN_HOLIDAY_RANGES) {
  for (const day of expandRange(start, end)) {
    CN_HOLIDAY_MAP.set(day, name)
  }
}

/** Approximate Good Friday dates used by NYSE (2025–2027). */
const US_GOOD_FRIDAY = new Set(['2025-04-18', '2026-04-03', '2027-03-26'])

function usHolidayName(ymd: string): string | null {
  const { y } = parseYmd(ymd)
  const fixed: Array<[string, string]> = [
    [observeFixed(y, 1, 1), 'New Year’s Day'],
    [nthWeekday(y, 1, 1, 3), 'Martin Luther King Jr. Day'],
    [nthWeekday(y, 2, 1, 3), 'Presidents’ Day'],
    [nthWeekday(y, 5, 1, -1), 'Memorial Day'],
    [observeFixed(y, 6, 19), 'Juneteenth'],
    [observeFixed(y, 7, 4), 'Independence Day'],
    [nthWeekday(y, 9, 1, 1), 'Labor Day'],
    [nthWeekday(y, 11, 4, 4), 'Thanksgiving'],
    [observeFixed(y, 12, 25), 'Christmas'],
  ]
  for (const [day, name] of fixed) {
    if (day === ymd) return name
  }
  if (US_GOOD_FRIDAY.has(ymd)) return 'Good Friday'
  return null
}

export interface MarketSessionStatus {
  market: StockMarket
  open: boolean
  /** Human-readable reason when closed. */
  reason?: string
}

export function getMarketSessionStatus(market: StockMarket, date: Date | string = new Date()): MarketSessionStatus {
  const ymd = toYmd(date)
  if (isWeekend(ymd)) {
    return {
      market,
      open: false,
      reason: market === 'CN' ? '周末休市' : 'Weekend',
    }
  }
  if (market === 'CN') {
    const holiday = CN_HOLIDAY_MAP.get(ymd)
    if (holiday) {
      return { market, open: false, reason: `${holiday}休市` }
    }
    return { market, open: true }
  }
  const us = usHolidayName(ymd)
  if (us) {
    return { market, open: false, reason: `${us} (market closed)` }
  }
  return { market, open: true }
}

export function isTradingDay(market: StockMarket, date: Date | string = new Date()): boolean {
  return getMarketSessionStatus(market, date).open
}

export function getEnabledOpenMarkets(
  enabled: { CN: boolean; US: boolean },
  date: Date | string = new Date(),
): { open: StockMarket[]; closed: MarketSessionStatus[] } {
  const open: StockMarket[] = []
  const closed: MarketSessionStatus[] = []
  for (const market of ['CN', 'US'] as const) {
    if (!enabled[market]) continue
    const status = getMarketSessionStatus(market, date)
    if (status.open) open.push(market)
    else closed.push(status)
  }
  return { open, closed }
}

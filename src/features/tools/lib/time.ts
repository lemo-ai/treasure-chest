import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import { ToolError } from './types'
import type {
  TimestampConvertPayload,
  TimestampConvertResult,
  TimeUnit,
  TimezoneConvertPayload,
  TimezoneConvertResult,
} from './types'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(customParseFormat)

const DEFAULT_GO_LAYOUT = '2006-01-02 15:04:05'
const DEFAULT_DAYJS_FORMAT = 'YYYY-MM-DD HH:mm:ss'

const GO_TO_DAYJS_TOKENS: Array<[string, string]> = [
  ['2006', 'YYYY'],
  ['06', 'YY'],
  ['01', 'MM'],
  ['1', 'M'],
  ['02', 'DD'],
  ['2', 'D'],
  ['15', 'HH'],
  ['03', 'hh'],
  ['3', 'h'],
  ['04', 'mm'],
  ['4', 'm'],
  ['05', 'ss'],
  ['5', 's'],
  ['PM', 'A'],
  ['pm', 'a'],
  ['Monday', 'dddd'],
  ['Mon', 'ddd'],
  ['January', 'MMMM'],
  ['Jan', 'MMM'],
  ['MST', 'zz'],
  ['Z07:00', 'Z'],
  ['07:00', 'Z'],
]

const goFormatCache = new Map<string, string>()

const hasDayjsToken = (fmt: string): boolean => /[YMDHhmsAaZ]/.test(fmt)

const convertGoLayout = (fmt: string): string => {
  if (goFormatCache.has(fmt)) return goFormatCache.get(fmt) as string

  const sortedTokens = [...GO_TO_DAYJS_TOKENS].sort((a, b) => b[0].length - a[0].length)
  let result = fmt
  for (const [go, dj] of sortedTokens) {
    result = result.split(go).join(dj)
  }
  goFormatCache.set(fmt, result)
  return result
}

const resolveFormat = (fmt?: string): { display: string; runtime: string } => {
  if (!fmt || !fmt.trim()) {
    return { display: DEFAULT_GO_LAYOUT, runtime: DEFAULT_DAYJS_FORMAT }
  }
  const trimmed = fmt.trim()
  if (hasDayjsToken(trimmed)) {
    return { display: trimmed, runtime: trimmed }
  }
  return { display: trimmed, runtime: convertGoLayout(trimmed) }
}

const ensureNumber = (value: unknown, code: string): number => {
  const num = typeof value === 'string' ? Number(value) : Number(value)
  if (Number.isNaN(num)) throw new ToolError(code)
  return num
}

const toMilliseconds = (timestamp: number, unit: TimeUnit = 'ms'): number =>
  unit === 's' ? timestamp * 1000 : timestamp

export const resolveTimezone = (zone?: string, offset?: string): string => {
  if (zone) return zone

  if (offset) {
    const normalized = offset.trim()
    if (/^[+-]?\d{1,2}$/.test(normalized)) {
      const hours = Number(normalized)
      if (hours >= -12 && hours <= 14) {
        const sign = hours >= 0 ? '-' : '+'
        return `Etc/GMT${sign}${Math.abs(hours)}`
      }
    }
  }

  return dayjs.tz.guess()
}

const parseDateTime = (value: string, runtime: string, tz: string): dayjs.Dayjs => {
  if (!value) throw new ToolError('datetimeRequired')

  const attempts: Array<() => dayjs.Dayjs> = [
    () => dayjs.tz(value, runtime, tz),
    () => dayjs(value, runtime),
    () => dayjs(value),
  ]

  for (const attempt of attempts) {
    try {
      const parsed = attempt()
      if (parsed.isValid()) return tz ? parsed.tz(tz) : parsed
    } catch {
      // try next strategy
    }
  }

  throw new ToolError('datetimeParseFailed')
}

export const convertTimestampLocal = (
  payload: TimestampConvertPayload,
): TimestampConvertResult => {
  const { runtime, display } = resolveFormat(payload.format)
  const tz = resolveTimezone(payload.timezone, payload.offset)

  if (payload.mode === 'timestamp_to_datetime') {
    const value = ensureNumber(payload.timestamp, 'invalidTimestamp')
    const ms = toMilliseconds(value, payload.unit)
    const target = dayjs(ms).tz(tz)
    return {
      dateTime: target.format(runtime),
      format: display,
      timezone: tz,
      timestampSeconds: Math.floor(ms / 1000),
      timestampMilliseconds: ms,
    }
  }

  if (!payload.datetime) throw new ToolError('datetimeRequired')

  const parsed = parseDateTime(payload.datetime, runtime, tz)
  return {
    dateTime: parsed.format(runtime),
    format: display,
    timezone: tz,
    timestampSeconds: parsed.unix(),
    timestampMilliseconds: parsed.valueOf(),
  }
}

const parseSource = (
  payload: TimezoneConvertPayload,
  runtime: string,
  timezoneName: string,
): dayjs.Dayjs => {
  if (!payload.sourceValue) throw new ToolError('sourceRequired')
  if (payload.sourceType === 'timestamp') {
    const num = ensureNumber(payload.sourceValue, 'invalidTimestamp')
    const ms = toMilliseconds(num, payload.sourceUnit)
    return dayjs(ms).tz(timezoneName)
  }
  return parseDateTime(payload.sourceValue, runtime, timezoneName)
}

export const convertTimezoneLocal = (
  payload: TimezoneConvertPayload,
): TimezoneConvertResult => {
  const { runtime, display } = resolveFormat(payload.format)
  const sourceTimezone = resolveTimezone(payload.sourceTimezone, payload.offset)
  const targetTimezone = resolveTimezone(payload.targetTimezone, payload.targetOffset)
  const source = parseSource(payload, runtime, sourceTimezone)
  const target = source.tz(targetTimezone)

  return {
    sourceDateTime: source.tz(sourceTimezone).format(runtime),
    sourceTimezone,
    targetDateTime: target.format(runtime),
    targetTimezone,
    timestampSeconds: source.unix(),
    timestampMilliseconds: source.valueOf(),
    format: display,
  }
}

export const DEFAULT_TIME_FORMAT = DEFAULT_GO_LAYOUT
export const DEFAULT_DAYJS_TIME_FORMAT = DEFAULT_DAYJS_FORMAT

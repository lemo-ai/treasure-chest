export type TimestampMode = 'timestamp_to_datetime' | 'datetime_to_timestamp'
export type TimeUnit = 'ms' | 's'

export interface TimestampConvertPayload {
  mode: TimestampMode
  timestamp?: number
  unit?: TimeUnit
  datetime?: string
  format?: string
  timezone?: string
  offset?: string
}

export interface TimestampConvertResult {
  dateTime: string
  format: string
  timezone: string
  timestampSeconds: number
  timestampMilliseconds: number
}

export type TimezoneSourceType = 'datetime' | 'timestamp'

export interface TimezoneConvertPayload {
  sourceValue: string
  sourceType: TimezoneSourceType
  sourceUnit?: TimeUnit
  sourceTimezone?: string
  targetTimezone?: string
  targetOffset?: string
  format?: string
  offset?: string
}

export interface TimezoneConvertResult {
  sourceDateTime: string
  sourceTimezone: string
  targetDateTime: string
  targetTimezone: string
  timestampSeconds: number
  timestampMilliseconds: number
  format: string
}

export type JsonFormatMode = 'pretty' | 'minify'

export class ToolError extends Error {
  readonly code: string

  constructor(code: string) {
    super(code)
    this.name = 'ToolError'
    this.code = code
  }
}

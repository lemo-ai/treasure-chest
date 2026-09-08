import { describe, expect, it } from 'vitest'
import { convertTimestampLocal, convertTimezoneLocal } from './time'
import { escapeJson, formatJsonLocal, unescapeJson } from './json'
import { ToolError } from './types'

describe('tools time', () => {
  it('converts ms timestamp to datetime in Shanghai', () => {
    const result = convertTimestampLocal({
      mode: 'timestamp_to_datetime',
      timestamp: 1_700_000_000_000,
      unit: 'ms',
      timezone: 'Asia/Shanghai',
      format: 'YYYY-MM-DD HH:mm:ss',
    })
    expect(result.timezone).toBe('Asia/Shanghai')
    expect(result.timestampMilliseconds).toBe(1_700_000_000_000)
    expect(result.dateTime).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  })

  it('converts across timezones', () => {
    const result = convertTimezoneLocal({
      sourceValue: '2024-01-01 12:00:00',
      sourceType: 'datetime',
      sourceTimezone: 'Asia/Shanghai',
      targetTimezone: 'UTC',
      format: 'YYYY-MM-DD HH:mm:ss',
    })
    expect(result.sourceTimezone).toBe('Asia/Shanghai')
    expect(result.targetTimezone).toBe('UTC')
    expect(result.targetDateTime).toBe('2024-01-01 04:00:00')
  })
})

describe('tools json', () => {
  it('pretty and minify', () => {
    const raw = '{"a":1,"b":[2,3]}'
    expect(formatJsonLocal(raw, 'pretty', 2)).toContain('\n')
    expect(formatJsonLocal(raw, 'minify')).toBe('{"a":1,"b":[2,3]}')
  })

  it('escape and unescape', () => {
    const raw = '{"ok":true}'
    const escaped = escapeJson(raw)
    expect(escaped.startsWith('"')).toBe(true)
    expect(unescapeJson(escaped)).toBe(raw)
  })

  it('throws ToolError on invalid json', () => {
    expect(() => formatJsonLocal('{')).toThrow(ToolError)
  })
})

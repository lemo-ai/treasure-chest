let cached: string[] | null = null

export function listTimeZones(): string[] {
  if (cached) return cached
  try {
    if (typeof Intl !== 'undefined' && 'supportedValuesOf' in Intl) {
      cached = Intl.supportedValuesOf('timeZone')
      return cached
    }
  } catch {
    // fall through
  }
  cached = [
    'UTC',
    'Asia/Shanghai',
    'Asia/Hong_Kong',
    'Asia/Tokyo',
    'Asia/Singapore',
    'Asia/Dubai',
    'Europe/London',
    'Europe/Paris',
    'Europe/Berlin',
    'America/New_York',
    'America/Los_Angeles',
    'America/Chicago',
    'Australia/Sydney',
  ]
  return cached
}

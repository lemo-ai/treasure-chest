export type TimeAtmosphere = 'morning' | 'noon' | 'dusk' | 'night'

export function getTimeAtmosphere(hour: number): TimeAtmosphere {
  if (hour >= 5 && hour < 11) return 'morning'
  if (hour >= 11 && hour < 17) return 'noon'
  if (hour >= 17 && hour < 20) return 'dusk'
  return 'night'
}

export function atmosphereGradient(atmosphere: TimeAtmosphere): string {
  return `var(--gradient-calendar-${atmosphere})`
}

export function useTimeAtmosphere(now: Date): { atmosphere: TimeAtmosphere; gradient: string } {
  const atmosphere = getTimeAtmosphere(now.getHours())
  return { atmosphere, gradient: atmosphereGradient(atmosphere) }
}

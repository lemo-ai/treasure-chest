import type { BirthProfile, DailyFortune } from '@shared'
import { getDb } from '../../db/Database'
import { logger } from '../../utils/logger'

function loadProfileFromDb(): BirthProfile | null {
  const row = getDb()
    .prepare('SELECT data FROM bazi_profiles ORDER BY updated_at DESC LIMIT 1')
    .get() as { data: string } | undefined
  if (!row) return null
  try {
    const profile = JSON.parse(row.data) as BirthProfile
    if (!profile?.id || !profile.name) return null
    return profile
  } catch (err) {
    logger.warn('failed to parse bazi profile', err)
    return null
  }
}

let cached: BirthProfile | null | undefined

export function initFortuneStore(): void {
  try {
    cached = loadProfileFromDb()
  } catch (err) {
    logger.warn('fortune store init failed', err)
    cached = null
  }
  logger.info(`fortune profile ${cached ? 'loaded' : 'empty'}`)
}

export const fortuneStore = {
  getProfile(): BirthProfile | null {
    if (cached === undefined) {
      try {
        cached = loadProfileFromDb()
      } catch {
        cached = null
      }
    }
    return cached ? { ...cached } : null
  },
  saveProfile(profile: BirthProfile): BirthProfile {
    const next: BirthProfile = {
      ...profile,
      updatedAt: new Date().toISOString(),
    }
    getDb()
      .prepare(
        `INSERT INTO bazi_profiles (id, data, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      )
      .run(next.id, JSON.stringify(next), next.updatedAt)
    cached = next
    return { ...next }
  },
  clearProfile(): void {
    getDb().prepare('DELETE FROM bazi_profiles').run()
    cached = null
  },
  cacheDailyFortune(fortune: DailyFortune): void {
    getDb()
      .prepare(
        `INSERT INTO fortune_daily_cache (profile_id, date, data) VALUES (?, ?, ?)
         ON CONFLICT(profile_id, date) DO UPDATE SET data = excluded.data`,
      )
      .run(fortune.profileId, fortune.date, JSON.stringify(fortune))
  },
  getCachedDailyFortune(profileId: string, date: string): DailyFortune | null {
    const row = getDb()
      .prepare('SELECT data FROM fortune_daily_cache WHERE profile_id = ? AND date = ?')
      .get(profileId, date) as { data: string } | undefined
    if (!row) return null
    try {
      return JSON.parse(row.data) as DailyFortune
    } catch {
      return null
    }
  },
}

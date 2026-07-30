import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { BirthProfile } from '@shared'
import { logger } from '../../utils/logger'

function profilePath(): string {
  return join(app.getPath('userData'), 'fortune', 'profile.json')
}

function loadProfile(): BirthProfile | null {
  try {
    const path = profilePath()
    if (!existsSync(path)) return null
    const raw = JSON.parse(readFileSync(path, 'utf8')) as BirthProfile
    if (!raw?.id || !raw.name) return null
    return raw
  } catch (err) {
    logger.warn('failed to load birth profile', err)
    return null
  }
}

let cached: BirthProfile | null | undefined

export function initFortuneStore(): void {
  cached = loadProfile()
  logger.info(`fortune profile ${cached ? 'loaded' : 'empty'}`)
}

export const fortuneStore = {
  getProfile(): BirthProfile | null {
    if (cached === undefined) cached = loadProfile()
    return cached ? { ...cached } : null
  },
  saveProfile(profile: BirthProfile): BirthProfile {
    const next: BirthProfile = {
      ...profile,
      updatedAt: new Date().toISOString(),
    }
    const path = profilePath()
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify(next, null, 2), 'utf8')
    cached = next
    return { ...next }
  },
  clearProfile(): void {
    const path = profilePath()
    if (existsSync(path)) {
      writeFileSync(path, '{}', 'utf8')
    }
    cached = null
  },
}

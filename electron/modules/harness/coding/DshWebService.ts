import { getDb } from '../../../db/Database'
import { getCordisStack } from '../cordis/CordisLoader'
import {
  getEmbeddedHarnessWebUrl,
  isEmbeddedHarnessWebRunning,
  startEmbeddedHarnessWebServer,
  stopEmbeddedHarnessWebServer,
} from './HarnessWebServer'

const DSH_WEB_KEY = 'harness.dshWebUrl'
const DSH_EMBEDDED_KEY = 'harness.dshWebEmbedded'
export const DEFAULT_DSH_WEB_URL = 'http://127.0.0.1:8787'

function nowIso(): string {
  return new Date().toISOString()
}

function readStoredUrl(): string | null {
  const row = getDb()
    .prepare(`SELECT value FROM app_settings WHERE key = ?`)
    .get(DSH_WEB_KEY) as { value: string } | undefined
  if (!row?.value) return null
  try {
    const parsed = JSON.parse(row.value) as string
    return typeof parsed === 'string' && parsed.trim() ? parsed.trim() : null
  } catch {
    return null
  }
}

function readEmbeddedPreference(): boolean {
  const row = getDb()
    .prepare(`SELECT value FROM app_settings WHERE key = ?`)
    .get(DSH_EMBEDDED_KEY) as { value: string } | undefined
  if (!row?.value) return true
  try {
    return JSON.parse(row.value) !== false
  } catch {
    return true
  }
}

export function isEmbeddedDshWebPreferred(): boolean {
  return readEmbeddedPreference()
}

export function setEmbeddedDshWebPreferred(enabled: boolean): boolean {
  getDb()
    .prepare(
      `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .run(DSH_EMBEDDED_KEY, JSON.stringify(enabled), nowIso())
  return enabled
}

export async function ensureEmbeddedDshWebServer(): Promise<string | null> {
  if (!readEmbeddedPreference()) return null
  if (isEmbeddedHarnessWebRunning()) return getEmbeddedHarnessWebUrl()
  try {
    return await startEmbeddedHarnessWebServer()
  } catch {
    return null
  }
}

export function getDshWebUrl(): string {
  const stored = readStoredUrl()
  if (stored && !readEmbeddedPreference()) return stored
  const embedded = getEmbeddedHarnessWebUrl()
  if (embedded) return embedded
  if (stored) return stored
  return getCordisStack().dshWebUrl?.trim() || DEFAULT_DSH_WEB_URL
}

export function setDshWebUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) throw new Error('dsh web url empty')
  setEmbeddedDshWebPreferred(false)
  getDb()
    .prepare(
      `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .run(DSH_WEB_KEY, JSON.stringify(trimmed), nowIso())
  return trimmed
}

export function stopEmbeddedDshWeb(): void {
  stopEmbeddedHarnessWebServer()
}

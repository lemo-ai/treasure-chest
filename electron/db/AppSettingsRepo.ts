import { getDb } from './Database'

export function getSetting<T>(key: string, fallback: T): T {
  const row = getDb().prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  if (!row) return fallback
  try {
    return JSON.parse(row.value) as T
  } catch {
    return fallback
  }
}

export function setSetting(key: string, value: unknown): void {
  getDb()
    .prepare(
      `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .run(key, JSON.stringify(value), new Date().toISOString())
}

export function getAllSettings(): Record<string, unknown> {
  const rows = getDb().prepare('SELECT key, value FROM app_settings').all() as Array<{
    key: string
    value: string
  }>
  const out: Record<string, unknown> = {}
  for (const row of rows) {
    try {
      out[row.key] = JSON.parse(row.value)
    } catch {
      out[row.key] = row.value
    }
  }
  return out
}

export function applySettings(entries: Record<string, unknown>): void {
  const stmt = getDb().prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  )
  const now = new Date().toISOString()
  const tx = getDb().transaction((items: Array<[string, unknown]>) => {
    for (const [key, value] of items) {
      stmt.run(key, JSON.stringify(value), now)
    }
  })
  tx(Object.entries(entries))
}

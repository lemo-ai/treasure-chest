import Database from 'better-sqlite3'
import { app } from 'electron'
import { existsSync, readFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import type { BirthProfile } from '@shared'
import { logger } from '../utils/logger'

const MIGRATION_VERSION = 1

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!db) throw new Error('database not initialized')
  return db
}

function runMigrations(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_settings (
      key        TEXT PRIMARY KEY NOT NULL,
      value      TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS bazi_profiles (
      id         TEXT PRIMARY KEY NOT NULL,
      data       TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS fortune_daily_cache (
      profile_id TEXT NOT NULL,
      date       TEXT NOT NULL,
      data       TEXT NOT NULL,
      PRIMARY KEY (profile_id, date)
    );
    CREATE TABLE IF NOT EXISTS window_state (
      window_id  TEXT PRIMARY KEY NOT NULL,
      state      TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `)

  const row = database.prepare('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1').get() as
    | { version: number }
    | undefined
  if (!row) {
    database.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(MIGRATION_VERSION)
  }
}

function setSetting(database: Database.Database, key: string, value: unknown): void {
  database
    .prepare(
      `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .run(key, JSON.stringify(value), new Date().toISOString())
}

function migrateLegacyJson(database: Database.Database): void {
  const userData = app.getPath('userData')
  const settingsPath = join(userData, 'settings.json')
  const profilePath = join(userData, 'fortune', 'profile.json')

  const hasSettings = database.prepare(`SELECT 1 FROM app_settings WHERE key = 'ui.theme' LIMIT 1`).get()
  if (!hasSettings && existsSync(settingsPath)) {
    try {
      const raw = JSON.parse(readFileSync(settingsPath, 'utf8')) as Record<string, unknown>
      if (raw.theme) setSetting(database, 'ui.theme', raw.theme)
      if (raw.locale) setSetting(database, 'ui.locale', raw.locale)
      if (raw.calendarMode) setSetting(database, 'calendar.mode', raw.calendarMode)
      if (raw.launchAtLogin !== undefined) setSetting(database, 'system.launchAtLogin', raw.launchAtLogin)
      if (raw.launchBehavior) setSetting(database, 'system.launchBehavior', raw.launchBehavior)
      if (raw.desktopWidget) setSetting(database, 'desktop.widget', raw.desktopWidget)
      renameSync(settingsPath, `${settingsPath}.migrated`)
      logger.info('migrated settings.json → SQLite')
    } catch (err) {
      logger.warn('legacy settings migration failed', err)
    }
  }

  const hasProfile = database.prepare(`SELECT 1 FROM bazi_profiles LIMIT 1`).get()
  if (!hasProfile && existsSync(profilePath)) {
    try {
      const raw = JSON.parse(readFileSync(profilePath, 'utf8')) as BirthProfile
      if (raw?.id && raw.name) {
        database
          .prepare(
            `INSERT INTO bazi_profiles (id, data, updated_at) VALUES (?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
          )
          .run(raw.id, JSON.stringify(raw), raw.updatedAt ?? new Date().toISOString())
      }
      renameSync(profilePath, `${profilePath}.migrated`)
      logger.info('migrated fortune/profile.json → SQLite')
    } catch (err) {
      logger.warn('legacy profile migration failed', err)
    }
  }
}

export function initDatabase(): void {
  const path = join(app.getPath('userData'), 'treasure-chest.db')
  db = new Database(path)
  db.pragma('journal_mode = WAL')
  runMigrations(db)
  migrateLegacyJson(db)
  logger.info(`database ready at ${path}`)
}

export function closeDatabase(): void {
  db?.close()
  db = null
}

import Database from 'better-sqlite3'
import { app } from 'electron'
import { existsSync, readFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import type { BirthProfile } from '@shared'
import { logger } from '../utils/logger'

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
    CREATE TABLE IF NOT EXISTS stocks_watchlist (
      market     TEXT NOT NULL,
      symbol     TEXT NOT NULL,
      data       TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (market, symbol)
    );
    CREATE TABLE IF NOT EXISTS stocks_reports (
      date       TEXT PRIMARY KEY NOT NULL,
      data       TEXT NOT NULL,
      generated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS stocks_scanner_pool (
      market     TEXT NOT NULL,
      symbol     TEXT NOT NULL,
      data       TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (market, symbol)
    );
    CREATE TABLE IF NOT EXISTS stocks_daily_bars (
      market     TEXT NOT NULL,
      symbol     TEXT NOT NULL,
      date       TEXT NOT NULL,
      open       REAL,
      high       REAL,
      low        REAL,
      close      REAL NOT NULL,
      volume     REAL,
      PRIMARY KEY (market, symbol, date)
    );
    CREATE TABLE IF NOT EXISTS stocks_bar_meta (
      market     TEXT NOT NULL,
      symbol     TEXT NOT NULL,
      currency   TEXT,
      fetched_at TEXT NOT NULL,
      PRIMARY KEY (market, symbol)
    );
    CREATE TABLE IF NOT EXISTS stocks_company_profiles (
      market        TEXT NOT NULL,
      symbol        TEXT NOT NULL,
      name          TEXT,
      company_intro TEXT NOT NULL,
      source        TEXT NOT NULL,
      updated_at    TEXT NOT NULL,
      PRIMARY KEY (market, symbol)
    );
  `)

  const row = database.prepare('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1').get() as
    | { version: number }
    | undefined
  const current = row?.version ?? 0
  if (current < 1) {
    database.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(1)
  }
  if (current < 2) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS stocks_daily_bars (
        market     TEXT NOT NULL,
        symbol     TEXT NOT NULL,
        date       TEXT NOT NULL,
        open       REAL,
        high       REAL,
        low        REAL,
        close      REAL NOT NULL,
        volume     REAL,
        PRIMARY KEY (market, symbol, date)
      );
      CREATE TABLE IF NOT EXISTS stocks_bar_meta (
        market     TEXT NOT NULL,
        symbol     TEXT NOT NULL,
        currency   TEXT,
        fetched_at TEXT NOT NULL,
        PRIMARY KEY (market, symbol)
      );
    `)
    database.prepare('INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)').run(2)
  }
  if (current < 3) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS stocks_company_profiles (
        market        TEXT NOT NULL,
        symbol        TEXT NOT NULL,
        name          TEXT,
        company_intro TEXT NOT NULL,
        source        TEXT NOT NULL,
        updated_at    TEXT NOT NULL,
        PRIMARY KEY (market, symbol)
      );
    `)
    database.prepare('INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)').run(3)
  }
  if (current < 4) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS knowledge_documents (
        id          TEXT PRIMARY KEY NOT NULL,
        title       TEXT NOT NULL,
        source      TEXT NOT NULL,
        mime        TEXT NOT NULL,
        bytes       INTEGER NOT NULL,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS knowledge_chunks (
        id           TEXT PRIMARY KEY NOT NULL,
        document_id  TEXT NOT NULL,
        ordinal      INTEGER NOT NULL,
        text         TEXT NOT NULL,
        created_at   TEXT NOT NULL,
        FOREIGN KEY (document_id) REFERENCES knowledge_documents(id) ON DELETE CASCADE
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_chunks_fts USING fts5(
        text,
        title,
        document_id UNINDEXED,
        chunk_id UNINDEXED,
        tokenize = 'unicode61'
      );
    `)
    database.prepare('INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)').run(4)
  }
  if (current < 5) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS knowledge_collections (
        id          TEXT PRIMARY KEY NOT NULL,
        name        TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        color       TEXT NOT NULL DEFAULT '#0fbea8',
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS knowledge_chunk_embeddings (
        chunk_id        TEXT PRIMARY KEY NOT NULL,
        model           TEXT NOT NULL,
        dims            INTEGER NOT NULL,
        embedding_json  TEXT NOT NULL,
        created_at      TEXT NOT NULL
      );
    `)
    // Add columns to knowledge_documents if missing
    const cols = database.prepare(`PRAGMA table_info(knowledge_documents)`).all() as Array<{ name: string }>
    const names = new Set(cols.map((c) => c.name))
    if (!names.has('collection_id')) {
      database.exec(`ALTER TABLE knowledge_documents ADD COLUMN collection_id TEXT NOT NULL DEFAULT 'default'`)
    }
    if (!names.has('status')) {
      database.exec(`ALTER TABLE knowledge_documents ADD COLUMN status TEXT NOT NULL DEFAULT 'ready'`)
    }
    if (!names.has('error_message')) {
      database.exec(`ALTER TABLE knowledge_documents ADD COLUMN error_message TEXT`)
    }
    const now = new Date().toISOString()
    database
      .prepare(
        `INSERT OR IGNORE INTO knowledge_collections (id, name, description, color, created_at, updated_at)
         VALUES ('default', '默认知识库', '系统默认分区', '#0fbea8', ?, ?)`,
      )
      .run(now, now)
    database.prepare('INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)').run(5)
  }
  if (current < 6) {
    const cols = database.prepare(`PRAGMA table_info(knowledge_documents)`).all() as Array<{ name: string }>
    const names = new Set(cols.map((c) => c.name))
    if (!names.has('file_name')) {
      database.exec(`ALTER TABLE knowledge_documents ADD COLUMN file_name TEXT`)
    }
    if (!names.has('has_original')) {
      database.exec(`ALTER TABLE knowledge_documents ADD COLUMN has_original INTEGER NOT NULL DEFAULT 0`)
    }
    if (!names.has('embedded')) {
      database.exec(`ALTER TABLE knowledge_documents ADD COLUMN embedded INTEGER NOT NULL DEFAULT 0`)
    }
    database.prepare('INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)').run(6)
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

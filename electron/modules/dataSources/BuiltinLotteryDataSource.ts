/**
 * Seed a built-in SQLite data source for the sports-lottery preset agent.
 * Runs on every app start so packaged installs get the same binding; path is
 * refreshed under the current userData directory.
 */
import { app } from 'electron'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import Database from 'better-sqlite3'
import { BUILTIN_LOTTERY_DATA_SOURCE_ID } from '@shared'
import { settingsStore } from '../settings/SettingsStore'
import { logger } from '../../utils/logger'

export function lotterySqlitePath(): string {
  return join(app.getPath('userData'), 'data', 'lottery.db')
}

function ensureLotteryDbFile(dbPath: string): void {
  mkdirSync(dirname(dbPath), { recursive: true })
  const db = new Database(dbPath)
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS matches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        product TEXT,
        home TEXT NOT NULL,
        away TEXT NOT NULL,
        score TEXT,
        odds_json TEXT,
        source_url TEXT,
        synced_at TEXT,
        UNIQUE(date, product, home, away)
      );
      CREATE INDEX IF NOT EXISTS idx_matches_date ON matches(date);
    `)
  } finally {
    db.close()
  }
}

/**
 * One-shot copy from the old app DB `lottery_matches` (specialized module)
 * into the preset `matches` table when the new DB is still empty.
 */
function migrateLegacyLotteryMatchesIfNeeded(dbPath: string): void {
  const dest = new Database(dbPath)
  try {
    const count = (dest.prepare('SELECT COUNT(*) AS n FROM matches').get() as { n: number }).n
    if (count > 0) return
    const legacyPath = join(app.getPath('userData'), 'treasure-chest.db')
    const probe = new Database(legacyPath, { fileMustExist: true, readonly: true })
    try {
      const has = probe
        .prepare(
          `SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='lottery_matches' LIMIT 1`,
        )
        .get() as { ok: number } | undefined
      if (!has) return
      const rows = probe
        .prepare(
          `SELECT product, match_id, match_num_str, match_date, match_time, league_name,
                  home_team, away_team, had_h, had_d, had_a, hhad_h, hhad_d, hhad_a,
                  hhad_goal_line, home_score, away_score, result_had, result_hhad, synced_at
           FROM lottery_matches`,
        )
        .all() as Array<Record<string, unknown>>
      if (!rows.length) return
      const insert = dest.prepare(
        `INSERT OR IGNORE INTO matches(date, product, home, away, score, odds_json, source_url, synced_at)
         VALUES (@date, @product, @home, @away, @score, @odds_json, NULL, @synced_at)`,
      )
      const now = new Date().toISOString()
      const tx = dest.transaction((list: typeof rows) => {
        for (const r of list) {
          const hs = r.home_score
          const as = r.away_score
          const score =
            hs != null && as != null && Number.isFinite(Number(hs)) && Number.isFinite(Number(as))
              ? `${hs}-${as}`
              : null
          const odds = {
            league: r.league_name,
            matchId: r.match_id,
            matchNum: r.match_num_str,
            matchTime: r.match_time,
            had: { h: r.had_h, d: r.had_d, a: r.had_a },
            hhad: {
              h: r.hhad_h,
              d: r.hhad_d,
              a: r.hhad_a,
              goalLine: r.hhad_goal_line,
            },
            resultHad: r.result_had,
            resultHhad: r.result_hhad,
          }
          insert.run({
            date: String(r.match_date || ''),
            product: r.product == null ? null : String(r.product),
            home: String(r.home_team || ''),
            away: String(r.away_team || ''),
            score,
            odds_json: JSON.stringify(odds),
            synced_at: r.synced_at ? String(r.synced_at) : now,
          })
        }
      })
      tx(rows)
      const after = (dest.prepare('SELECT COUNT(*) AS n FROM matches').get() as { n: number }).n
      logger.info(`migrated legacy lottery_matches → matches rows=${after}`)
    } finally {
      probe.close()
    }
  } catch (err) {
    // No legacy DB / table — fine for fresh installs
    logger.info(`legacy lottery migrate skipped: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    dest.close()
  }
}

/** Idempotent: create DB file + upsert Settings data source (+ one-time legacy import). */
export function ensureBuiltinLotteryDataSource(): void {
  try {
    const dbPath = lotterySqlitePath()
    ensureLotteryDbFile(dbPath)
    migrateLegacyLotteryMatchesIfNeeded(dbPath)
    const locale = settingsStore.getLocale()
    const en = locale.toLowerCase().startsWith('en')
    const name = en ? 'Sports lottery (local SQLite)' : '体彩本地库 (SQLite)'
    settingsStore.upsertDataSource({
      id: BUILTIN_LOTTERY_DATA_SOURCE_ID,
      name,
      enabled: true,
      kind: 'sqlite',
      icon: '⚽',
      path: dbPath,
      sql: 'SELECT date, product, home, away, score, odds_json, source_url, synced_at FROM matches ORDER BY date DESC LIMIT 50',
    })
    logger.info(`builtin lottery data source ready path=${dbPath}`)
  } catch (err) {
    logger.warn('ensureBuiltinLotteryDataSource failed', err)
  }
}

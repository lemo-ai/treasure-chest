import type { DataSourceConfig } from '@shared'
import Database from 'better-sqlite3'
import { settingsStore } from '../settings/SettingsStore'
import { readLocalFileSafe } from '../notifications/ChannelNotify'
import { logger } from '../../utils/logger'
import { resolveDatabaseSource } from './DataSourceDbService'

const MAX_CHUNK = 12_000

const DB_KINDS = new Set([
  'sqlite',
  'duckdb',
  'postgres',
  'mysql',
  'mariadb',
  'mssql',
  'oracle',
  'mongodb',
  'redis',
  'clickhouse',
  'cassandra',
  'elasticsearch',
  'influxdb',
  'dynamodb',
  'snowflake',
  'cockroach',
  'tidb',
  'redshift',
  'trino',
  'qdrant',
  'chroma',
])

function digJson(data: unknown, path?: string): unknown {
  if (!path || !path.trim()) return data
  const parts = path.split('.').map((p) => p.trim()).filter(Boolean)
  let cur: unknown = data
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[part]
  }
  return cur
}

async function fetchHttp(src: DataSourceConfig, preferJson: boolean): Promise<string> {
  const url = String(src.url || '').trim()
  if (!url) throw new Error('url_required')
  const headers: Record<string, string> = {
    Accept: preferJson ? 'application/json,text/plain,*/*' : 'text/plain,text/markdown,text/csv,*/*',
  }
  if (src.headers) {
    for (const [k, v] of Object.entries(src.headers)) {
      if (k.trim()) headers[k.trim()] = String(v)
    }
  }
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new Error(`http_${res.status}`)
  const contentType = res.headers.get('content-type') || ''
  const text = await res.text()
  if (
    preferJson &&
    (contentType.includes('json') || text.trim().startsWith('{') || text.trim().startsWith('['))
  ) {
    try {
      const json = JSON.parse(text) as unknown
      const picked = digJson(json, src.jsonPath)
      return JSON.stringify(picked ?? json, null, 2).slice(0, MAX_CHUNK)
    } catch {
      return text.slice(0, MAX_CHUNK)
    }
  }
  return text.slice(0, MAX_CHUNK)
}

export async function resolveDataSourceText(src: DataSourceConfig): Promise<string> {
  if (src.kind === 'static_text') {
    return String(src.content || '').slice(0, MAX_CHUNK)
  }
  if (src.kind === 'local_file') {
    const path = String(src.path || '').trim()
    if (!path) throw new Error('path_required')
    return readLocalFileSafe(path, MAX_CHUNK).slice(0, MAX_CHUNK)
  }
  if (DB_KINDS.has(src.kind)) {
    return resolveDatabaseSource(src)
  }
  if (src.kind === 'http_text') {
    return fetchHttp(src, false)
  }
  return fetchHttp(src, true)
}

export async function buildDataSourcesAppendix(ids: string[] | undefined): Promise<string> {
  if (!ids || ids.length === 0) return ''
  const all = settingsStore.getDataSources().sources
  const blocks: string[] = []
  for (const id of ids) {
    const src = all.find((s) => s.id === id && s.enabled)
    if (!src) continue
    try {
      const text = await resolveDataSourceText(src)
      blocks.push(`### ${src.name} (${src.kind})\n${text}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.warn(`data source ${id} failed`, err)
      blocks.push(`### ${src.name} (${src.kind})\n[error] ${msg}`)
    }
  }
  if (!blocks.length) return ''
  return `## Data sources\n\n${blocks.join('\n\n')}`
}

export async function previewDataSource(id: string): Promise<{ ok: boolean; text?: string; error?: string }> {
  const src = settingsStore.getDataSources().sources.find((s) => s.id === id)
  if (!src) return { ok: false, error: 'not_found' }
  try {
    const text = await resolveDataSourceText(src)
    return { ok: true, text }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export type DataSourceListItem = {
  id: string
  name: string
  kind: DataSourceConfig['kind']
  enabled: boolean
  /** True when agent may call query_data_source on this id */
  allowed: boolean
  /** SQL/DB kinds are read_write via query_data_source sql override */
  access?: 'read_write' | 'read'
  /** SQLite/file path when relevant */
  path?: string
  /** Default SQL saved on the source */
  defaultSql?: string
  /** Table/column hints for SQL kinds (so the model does not invent column names) */
  schemaHint?: string
  /** Example SELECT the model can copy */
  exampleSql?: string
}

function sqliteSchemaHint(path: string | undefined): { schemaHint?: string; exampleSql?: string } {
  const p = String(path || '').trim()
  if (!p) return {}
  try {
    const db = new Database(p, { fileMustExist: true, readonly: true })
    try {
      const tables = db
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
        )
        .all() as Array<{ name: string }>
      const parts: string[] = []
      for (const t of tables.slice(0, 8)) {
        const safe = t.name.replace(/'/g, "''")
        const cols = db.prepare(`PRAGMA table_info('${safe}')`).all() as Array<{ name: string }>
        parts.push(`${t.name}(${cols.map((c) => c.name).join(', ')})`)
      }
      if (!parts.length) return {}
      const example =
        tables.some((t) => t.name === 'matches')
          ? `SELECT date, product, home, away, score FROM matches ORDER BY date DESC LIMIT 30`
          : `SELECT * FROM ${tables[0]!.name} LIMIT 20`
      return { schemaHint: parts.join('; '), exampleSql: example }
    } finally {
      db.close()
    }
  } catch {
    return {}
  }
}

/** List data sources visible to an agent (empty allowlist = none for scoped agents). */
export function listDataSourcesForTools(allowedIds?: string[] | null): DataSourceListItem[] {
  const all = settingsStore.getDataSources().sources
  const allow =
    allowedIds == null
      ? null
      : new Set(allowedIds.map((id) => id.trim()).filter(Boolean))
  return all.map((s) => {
    const item: DataSourceListItem = {
      id: s.id,
      name: s.name,
      kind: s.kind,
      enabled: s.enabled,
      allowed: allow == null ? s.enabled : allow.has(s.id) && s.enabled,
      access: DB_KINDS.has(s.kind) ? 'read_write' : 'read',
      path: s.path,
      defaultSql: s.sql,
    }
    if (s.kind === 'sqlite' && item.allowed && s.enabled) {
      Object.assign(item, sqliteSchemaHint(s.path))
    }
    return item
  })
}

/** Rewrite common legacy lottery_* column names to the preset matches schema. */
function rewriteLegacyLotterySql(sql: string): string {
  return sql
    .replace(/\bmatch_date\b/gi, 'date')
    .replace(/\bhome_team\b/gi, 'home')
    .replace(/\baway_team\b/gi, 'away')
    .replace(/\blottery_matches\b/gi, 'matches')
    .replace(/\bmatch_id\b/gi, "json_extract(odds_json,'$.matchId')")
    .replace(/\bleague_name\b/gi, "json_extract(odds_json,'$.league')")
}

/**
 * Run a bound data source. Optional `sql` / `query` overrides the saved default for this call
 * (so agents can INSERT/SELECT against a configured SQLite/DB without editing Settings each time).
 */
export async function queryDataSourceForTools(
  id: string,
  opts?: {
    allowedIds?: string[] | null
    sql?: string
    query?: string
  },
): Promise<{
  ok: boolean
  text?: string
  error?: string
  name?: string
  kind?: string
  schemaHint?: string
  exampleSql?: string
  rewrittenSql?: string
}> {
  const src = settingsStore.getDataSources().sources.find((s) => s.id === id)
  if (!src) return { ok: false, error: 'not_found' }
  if (!src.enabled) return { ok: false, error: 'disabled' }
  if (opts?.allowedIds != null) {
    const allow = new Set(opts.allowedIds.map((x) => x.trim()).filter(Boolean))
    if (!allow.has(id)) return { ok: false, error: 'not_allowed_for_agent' }
  }
  let sql = opts?.sql?.trim()
  const query = opts?.query?.trim()
  let rewrittenSql: string | undefined
  if (sql && src.kind === 'sqlite') {
    const next = rewriteLegacyLotterySql(sql)
    if (next !== sql) {
      rewrittenSql = next
      sql = next
    }
  }
  const effective: DataSourceConfig = {
    ...src,
    ...(sql ? { sql } : {}),
    ...(query ? { query } : {}),
  }
  const schema = src.kind === 'sqlite' ? sqliteSchemaHint(src.path) : {}
  try {
    const text = await resolveDataSourceText(effective)
    return { ok: true, text, name: src.name, kind: src.kind, rewrittenSql, ...schema }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // One retry after rewrite if the model used legacy names and we did not rewrite yet
    if (src.kind === 'sqlite' && opts?.sql && /no such column/i.test(msg)) {
      const fixed = rewriteLegacyLotterySql(opts.sql)
      if (fixed !== opts.sql) {
        try {
          const text = await resolveDataSourceText({ ...src, sql: fixed })
          return {
            ok: true,
            text,
            name: src.name,
            kind: src.kind,
            rewrittenSql: fixed,
            ...schema,
          }
        } catch {
          /* fall through */
        }
      }
    }
    return {
      ok: false,
      error: msg,
      name: src.name,
      kind: src.kind,
      rewrittenSql,
      ...schema,
      hint:
        schema.schemaHint || schema.exampleSql
          ? `Use only columns in schemaHint. Example: ${schema.exampleSql}`
          : undefined,
    } as {
      ok: boolean
      text?: string
      error?: string
      name?: string
      kind?: string
      schemaHint?: string
      exampleSql?: string
      rewrittenSql?: string
      hint?: string
    }
  }
}

/** Short catalog for system prompt (no row payloads). */
export function buildDataSourcesCatalogHint(ids: string[] | undefined, isEn: boolean): string {
  const all = settingsStore.getDataSources().sources
  const selected =
    ids === undefined
      ? all.filter((s) => s.enabled)
      : ids.length
        ? all.filter((s) => ids.includes(s.id))
        : []
  const lines: string[] = []
  for (const src of selected) {
    const flag = src.enabled ? '' : isEn ? ' (disabled)' : '（已禁用）'
    const schema = src.kind === 'sqlite' ? sqliteSchemaHint(src.path) : {}
    const access = DB_KINDS.has(src.kind)
      ? isEn
        ? ' [read_write: SELECT/INSERT/UPDATE via sql]'
        : ' [可读写：用 sql 参数 SELECT/INSERT/UPDATE]'
      : ''
    lines.push(`- ${src.name} [${src.kind}] id=${src.id}${flag}${access}`)
    if (schema.schemaHint) {
      lines.push(
        isEn
          ? `  schema: ${schema.schemaHint}`
          : `  表结构：${schema.schemaHint}`,
      )
    }
    if (schema.exampleSql) {
      lines.push(isEn ? `  example: ${schema.exampleSql}` : `  示例：${schema.exampleSql}`)
    }
  }
  if (!lines.length) return ''
  return isEn
    ? `Bound data sources (list_data_sources / query_data_source; pass sql for SQL kinds — SELECT or INSERT/UPDATE; never invent a read-only policy):\n${lines.join('\n')}`
    : `已绑定数据源（list_data_sources / query_data_source；SQL 用 schema 列名，可 SELECT 也可 INSERT/UPDATE 落库，禁止编造「只读/无法改权限」）：\n${lines.join('\n')}`
}

/** Probe connectivity using the draft/saved config (does not require prior save). */
export async function testDataSource(
  input: DataSourceConfig,
): Promise<{ ok: boolean; text?: string; error?: string; latencyMs?: number }> {
  const started = Date.now()
  try {
    const text = await resolveDataSourceText(input)
    const preview = text.length > 400 ? `${text.slice(0, 400)}…` : text
    return { ok: true, text: preview, latencyMs: Date.now() - started }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - started,
    }
  }
}

import type { DataSourceConfig } from '@shared'
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

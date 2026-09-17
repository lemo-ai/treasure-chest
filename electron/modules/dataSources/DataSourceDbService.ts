import Database from 'better-sqlite3'
import type { DataSourceConfig, DataSourceDriverInfo, DataSourceKind } from '@shared'
import { DATA_SOURCE_DRIVER_INFO, defaultPortForKind, isMysqlWireKind, isPgWireKind } from '@shared'
import { logger } from '../../utils/logger'
import {
  driverIdForKind,
  ensureDriverInstalledWithDeps,
  getDriverStatus,
  listOnDemandDriverStatuses,
  requireDriver,
} from './DataSourceDriverInstaller'

const MAX_CHUNK = 12_000
const MAX_ROWS = 200

function normalizeSql(sql: string): string {
  const trimmed = sql.trim().replace(/;+\s*$/, '')
  if (!trimmed) throw new Error('sql_required')
  return trimmed
}

function rowsToText(rows: unknown[]): string {
  if (!rows.length) return '(0 rows)'
  return JSON.stringify(rows.slice(0, MAX_ROWS), null, 2).slice(0, MAX_CHUNK)
}

async function ensureKindDriver(kind: string, version?: string): Promise<void> {
  const id = driverIdForKind(kind)
  if (!id) return
  await ensureDriverInstalledWithDeps(id, version ? { version } : undefined)
}

export function listDataSourceDrivers(): DataSourceDriverInfo[] {
  const onDemand = new Map(listOnDemandDriverStatuses().map((s) => [s.packageName, s]))
  return DATA_SOURCE_DRIVER_INFO.map((info) => {
    if (!info.packageName) return { ...info }
    if (info.mode === 'bundled_npm' && info.packageName === 'better-sqlite3') {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pkg = require('better-sqlite3/package.json') as { version?: string }
        return {
          ...info,
          packageVersion: pkg.version,
          installedVersion: pkg.version,
        }
      } catch {
        return { ...info }
      }
    }
    const st = onDemand.get(info.packageName)
    return {
      ...info,
      packageVersion: info.packageVersion || st?.targetVersion,
      installedVersion: st?.installedVersion,
    }
  })
}

export async function ensureDataSourceDriverForKind(
  kind: string,
  version?: string,
): Promise<{ ok: boolean; status?: ReturnType<typeof getDriverStatus>; error?: string }> {
  const id = driverIdForKind(kind)
  if (!id) return { ok: true }
  try {
    const status = await ensureDriverInstalledWithDeps(id, version ? { version } : undefined)
    return { ok: true, status }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function resolveSqlite(src: DataSourceConfig): Promise<string> {
  const path = String(src.path || '').trim()
  if (!path) throw new Error('path_required')
  const sql = normalizeSql(String(src.sql || 'SELECT 1 AS ok'))
  const db = new Database(path, { fileMustExist: true })
  try {
    const stmt = db.prepare(sql)
    if (stmt.reader) {
      return rowsToText(stmt.all())
    }
    const info = stmt.run()
    return JSON.stringify(
      { changes: info.changes, lastInsertRowid: Number(info.lastInsertRowid) },
      null,
      2,
    )
  } finally {
    db.close()
  }
}

export async function resolveDuckdb(src: DataSourceConfig): Promise<string> {
  await ensureKindDriver('duckdb', src.driverVersion)
  const duckdb = requireDriver<{
    Database: new (
      path: string,
      cb: (err: Error | null, db: {
        all: (sql: string, cb: (err: Error | null, rows: unknown[]) => void) => void
        close: (cb: (err: Error | null) => void) => void
      }) => void,
    ) => void
  }>('duckdb')
  const path = String(src.path || '').trim() || ':memory:'
  const sql = normalizeSql(String(src.sql || 'SELECT 1 AS ok'))
  const db = await new Promise<{
    all: (sql: string, cb: (err: Error | null, rows: unknown[]) => void) => void
    close: (cb: (err: Error | null) => void) => void
  }>((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    new (duckdb as any).Database(path, (err: Error | null, database: unknown) => {
      if (err) reject(err)
      else resolve(database as {
        all: (sql: string, cb: (err: Error | null, rows: unknown[]) => void) => void
        close: (cb: (err: Error | null) => void) => void
      })
    })
  })
  try {
    const rows = await new Promise<unknown[]>((resolve, reject) => {
      db.all(sql, (err, result) => {
        if (err) reject(err)
        else resolve(result || [])
      })
    })
    return rowsToText(rows)
  } finally {
    await new Promise<void>((resolve) => {
      db.close(() => resolve())
    })
  }
}

export async function resolvePostgres(src: DataSourceConfig): Promise<string> {
  await ensureKindDriver(src.kind, src.driverVersion)
  const pg = requireDriver<{
    Client: new (cfg: Record<string, unknown>) => {
      connect: () => Promise<void>
      query: (sql: string) => Promise<{ rows: unknown[]; rowCount?: number }>
      end: () => Promise<void>
    }
  }>('pg')
  const sql = normalizeSql(String(src.sql || 'SELECT 1 AS ok'))
  const client = new pg.Client({
    host: src.host || '127.0.0.1',
    port: src.port || defaultPortForKind(src.kind) || 5432,
    database: src.database || 'postgres',
    user: src.username || 'postgres',
    password: src.password || '',
    ssl: src.ssl ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 12_000,
    query_timeout: 30_000,
  })
  await client.connect()
  try {
    const res = await client.query(sql)
    if (Array.isArray(res.rows) && res.rows.length) return rowsToText(res.rows)
    return JSON.stringify({ rowCount: res.rowCount ?? 0 }, null, 2)
  } finally {
    await client.end().catch(() => undefined)
  }
}

export async function resolveMysql(src: DataSourceConfig): Promise<string> {
  await ensureKindDriver(src.kind, src.driverVersion)
  const { createRequire } = await import('node:module')
  const { join } = await import('node:path')
  const { app } = await import('electron')
  const req = createRequire(join(app.getPath('userData'), 'data-source-drivers', 'package.json'))
  const mysql = req('mysql2/promise') as {
    createConnection: (cfg: Record<string, unknown>) => Promise<{
      query: (sql: string) => Promise<[unknown, unknown]>
      end: () => Promise<void>
    }>
  }
  const sql = normalizeSql(String(src.sql || 'SELECT 1 AS ok'))
  const conn = await mysql.createConnection({
    host: src.host || '127.0.0.1',
    port: src.port || defaultPortForKind(src.kind) || 3306,
    database: src.database || undefined,
    user: src.username || 'root',
    password: src.password || '',
    ssl: src.ssl ? {} : undefined,
    connectTimeout: 12_000,
  })
  try {
    const [rows] = await conn.query(sql)
    if (Array.isArray(rows)) return rowsToText(rows as unknown[])
    return JSON.stringify(rows ?? { ok: true }, null, 2).slice(0, MAX_CHUNK)
  } finally {
    await conn.end().catch(() => undefined)
  }
}

export async function resolveMssql(src: DataSourceConfig): Promise<string> {
  await ensureKindDriver('mssql', src.driverVersion)
  const sql = requireDriver<{
    connect: (cfg: Record<string, unknown>) => Promise<{
      request: () => { query: (q: string) => Promise<{ recordset: unknown[] }> }
      close: () => Promise<void>
    }>
  }>('mssql')
  const q = normalizeSql(String(src.sql || 'SELECT 1 AS ok'))
  const pool = await sql.connect({
    server: src.host || '127.0.0.1',
    port: src.port || 1433,
    database: src.database || undefined,
    user: src.username || 'sa',
    password: src.password || '',
    options: {
      encrypt: Boolean(src.ssl),
      trustServerCertificate: true,
      connectTimeout: 12_000,
    },
  })
  try {
    const result = await pool.request().query(q)
    return rowsToText(result.recordset || [])
  } finally {
    await pool.close().catch(() => undefined)
  }
}

export async function resolveOracle(src: DataSourceConfig): Promise<string> {
  await ensureKindDriver('oracle', src.driverVersion)
  const oracledb = requireDriver<{
    getConnection: (cfg: Record<string, unknown>) => Promise<{
      execute: (
        sql: string,
        binds: unknown[],
        opts: Record<string, unknown>,
      ) => Promise<{ rows?: unknown[]; rowsAffected?: number }>
      close: () => Promise<void>
    }>
    OUT_FORMAT_OBJECT: number
  }>('oracledb')
  const q = normalizeSql(String(src.sql || 'SELECT 1 AS OK FROM DUAL'))
  const connectString =
    String(src.url || '').trim() ||
    `${src.host || '127.0.0.1'}:${src.port || 1521}/${src.database || 'ORCL'}`
  const conn = await oracledb.getConnection({
    user: src.username || '',
    password: src.password || '',
    connectString,
  })
  try {
    const result = await conn.execute(q, [], {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      maxRows: MAX_ROWS,
    })
    if (Array.isArray(result.rows)) return rowsToText(result.rows)
    return JSON.stringify({ rowsAffected: result.rowsAffected ?? 0 }, null, 2)
  } finally {
    await conn.close().catch(() => undefined)
  }
}

export async function resolveMongodb(src: DataSourceConfig): Promise<string> {
  await ensureKindDriver('mongodb', src.driverVersion)
  const { MongoClient } = requireDriver<{
    MongoClient: new (
      url: string,
      opts?: Record<string, unknown>,
    ) => {
      connect: () => Promise<unknown>
      db: (name: string) => {
        collection: (name: string) => {
          find: (filter: Record<string, unknown>) => {
            limit: (n: number) => { toArray: () => Promise<unknown[]> }
          }
        }
      }
      close: () => Promise<void>
    }
  }>('mongodb')

  const url =
    String(src.url || '').trim() ||
    `mongodb://${encodeURIComponent(src.username || '')}:${encodeURIComponent(src.password || '')}@${src.host || '127.0.0.1'}:${src.port || 27017}`
  const dbName = String(src.database || '').trim()
  const collection = String(src.collection || '').trim()
  if (!dbName || !collection) throw new Error('database_and_collection_required')
  let filter: Record<string, unknown> = {}
  if (src.query?.trim()) {
    try {
      filter = JSON.parse(src.query) as Record<string, unknown>
    } catch {
      throw new Error('query_must_be_json')
    }
  }
  const client = new MongoClient(url, { serverSelectionTimeoutMS: 12_000 })
  await client.connect()
  try {
    const rows = await client.db(dbName).collection(collection).find(filter).limit(MAX_ROWS).toArray()
    return rowsToText(rows)
  } finally {
    await client.close().catch(() => undefined)
  }
}

export async function resolveRedis(src: DataSourceConfig): Promise<string> {
  await ensureKindDriver('redis', src.driverVersion)
  const { createClient } = requireDriver<{
    createClient: (opts: Record<string, unknown>) => {
      connect: () => Promise<void>
      sendCommand: (args: Array<string | Buffer>) => Promise<unknown>
      quit: () => Promise<void>
    }
  }>('redis')

  const url = String(src.url || '').trim()
  const dbIndex = src.database?.trim() ? Number(src.database) : undefined
  const client = createClient(
    url
      ? { url }
      : {
          socket: {
            host: src.host || '127.0.0.1',
            port: src.port || 6379,
            connectTimeout: 12_000,
          },
          password: src.password || undefined,
          username: src.username || undefined,
          database: Number.isFinite(dbIndex) ? dbIndex : undefined,
        },
  )
  await client.connect()
  try {
    const raw = String(src.query || src.sql || 'PING').trim() || 'PING'
    const parts =
      raw.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((p) => p.replace(/^"|"$/g, '')) ?? ['PING']
    const result = await client.sendCommand(parts)
    if (typeof result === 'string') return result.slice(0, MAX_CHUNK)
    if (Buffer.isBuffer(result)) return result.toString('utf8').slice(0, MAX_CHUNK)
    return JSON.stringify(result, null, 2).slice(0, MAX_CHUNK)
  } finally {
    await client.quit().catch(() => undefined)
  }
}

export async function resolveClickhouse(src: DataSourceConfig): Promise<string> {
  await ensureKindDriver('clickhouse', src.driverVersion)
  const { createClient } = requireDriver<{
    createClient: (cfg: Record<string, unknown>) => {
      query: (opts: { query: string; format: string }) => Promise<{ json: <T = unknown>() => Promise<T> }>
      close: () => Promise<void>
    }
  }>('clickhouse')

  const host =
    String(src.url || '').trim() ||
    `http://${src.host || '127.0.0.1'}:${src.port || 8123}`
  const client = createClient({
    host,
    username: src.username || 'default',
    password: src.password || '',
    database: src.database || 'default',
    request_timeout: 30_000,
  })
  try {
    const sql = normalizeSql(String(src.sql || 'SELECT 1'))
    const result = await client.query({ query: sql, format: 'JSONEachRow' })
    const rows = await result.json<unknown>()
    if (Array.isArray(rows)) return rowsToText(rows)
    return JSON.stringify(rows ?? { ok: true }, null, 2).slice(0, MAX_CHUNK)
  } finally {
    await client.close().catch(() => undefined)
  }
}

export async function resolveCassandra(src: DataSourceConfig): Promise<string> {
  await ensureKindDriver('cassandra', src.driverVersion)
  const cassandra = requireDriver<{
    Client: new (cfg: Record<string, unknown>) => {
      connect: () => Promise<void>
      execute: (query: string, params?: unknown[], opts?: Record<string, unknown>) => Promise<{ rows: unknown[] }>
      shutdown: () => Promise<void>
    }
  }>('cassandra')
  const client = new cassandra.Client({
    contactPoints: [src.host || '127.0.0.1'],
    localDataCenter: src.collection || 'datacenter1',
    keyspace: src.database || undefined,
    credentials:
      src.username || src.password
        ? { username: src.username || '', password: src.password || '' }
        : undefined,
    protocolOptions: { port: src.port || 9042 },
  })
  await client.connect()
  try {
    const cql = normalizeSql(String(src.sql || src.query || 'SELECT now() FROM system.local'))
    const result = await client.execute(cql, [], { prepare: true })
    return rowsToText(result.rows || [])
  } finally {
    await client.shutdown().catch(() => undefined)
  }
}

export async function resolveElasticsearch(src: DataSourceConfig): Promise<string> {
  await ensureKindDriver('elasticsearch', src.driverVersion)
  const { Client } = requireDriver<{
    Client: new (cfg: Record<string, unknown>) => {
      search: (opts: Record<string, unknown>) => Promise<{ hits?: { hits?: unknown[] } }>
      close: () => Promise<void>
    }
  }>('elasticsearch')
  const node =
    String(src.url || '').trim() ||
    `http://${src.host || '127.0.0.1'}:${src.port || 9200}`
  const client = new Client({
    node,
    auth:
      src.username || src.password
        ? { username: src.username || '', password: src.password || '' }
        : undefined,
    requestTimeout: 20_000,
  })
  try {
    const index = String(src.collection || src.database || '_all').trim()
    let body: Record<string, unknown> = { size: Math.min(40, Math.max(1, src.topK || 8)) }
    if (src.query?.trim()) {
      try {
        body = { ...body, ...(JSON.parse(src.query) as Record<string, unknown>) }
      } catch {
        body.query = { query_string: { query: src.query.trim() } }
      }
    } else {
      body.query = { match_all: {} }
    }
    const res = await client.search({ index, ...body })
    return JSON.stringify(res.hits?.hits ?? res, null, 2).slice(0, MAX_CHUNK)
  } finally {
    await client.close().catch(() => undefined)
  }
}

export async function resolveInfluxdb(src: DataSourceConfig): Promise<string> {
  await ensureKindDriver('influxdb', src.driverVersion)
  const mod = requireDriver<{
    InfluxDB: new (cfg: { url: string; token: string }) => {
      getQueryApi: (org: string) => {
        collectRows: (query: string) => Promise<unknown[]>
      }
    }
  }>('influxdb')
  const url =
    String(src.url || '').trim() ||
    `http://${src.host || '127.0.0.1'}:${src.port || 8086}`
  const token = src.password || ''
  const org = src.username || ''
  if (!token || !org) throw new Error('influx_org_and_token_required')
  const flux =
    String(src.query || src.sql || '').trim() ||
    `from(bucket: "${src.database || 'default'}") |> range(start: -1h) |> limit(n: 20)`
  const api = new mod.InfluxDB({ url, token }).getQueryApi(org)
  const rows = await api.collectRows(flux)
  return rowsToText(rows)
}

export async function resolveDynamodb(src: DataSourceConfig): Promise<string> {
  await ensureKindDriver('dynamodb', src.driverVersion)
  const { DynamoDBClient } = requireDriver<{
    DynamoDBClient: new (cfg: Record<string, unknown>) => unknown
  }>('dynamodb')
  const { DynamoDBDocumentClient, ScanCommand, QueryCommand } = requireDriver<{
    DynamoDBDocumentClient: { from: (c: unknown) => { send: (cmd: unknown) => Promise<{ Items?: unknown[] }> } }
    ScanCommand: new (input: Record<string, unknown>) => unknown
    QueryCommand: new (input: Record<string, unknown>) => unknown
  }>('dynamodbDoc')

  const region = src.host || src.database || 'us-east-1'
  const table = String(src.collection || '').trim()
  if (!table) throw new Error('table_required')
  const client = DynamoDBDocumentClient.from(
    new DynamoDBClient({
      region,
      endpoint: src.url?.trim() || undefined,
      credentials:
        src.username || src.password
          ? { accessKeyId: src.username || '', secretAccessKey: src.password || '' }
          : undefined,
    }),
  )
  let input: Record<string, unknown> = { TableName: table, Limit: Math.min(40, src.topK || 20) }
  let useQuery = false
  if (src.query?.trim()) {
    try {
      const parsed = JSON.parse(src.query) as Record<string, unknown>
      input = { ...input, ...parsed }
      useQuery = Boolean(parsed.KeyConditionExpression)
    } catch {
      throw new Error('query_must_be_json')
    }
  }
  const res = await client.send(useQuery ? new QueryCommand(input) : new ScanCommand(input))
  return rowsToText(res.Items || [])
}

export async function resolveSnowflake(src: DataSourceConfig): Promise<string> {
  await ensureKindDriver('snowflake', src.driverVersion)
  const snowflake = requireDriver<{
    createConnection: (cfg: Record<string, unknown>) => {
      connect: (cb: (err: Error | null) => void) => void
      execute: (opts: {
        sqlText: string
        complete: (err: Error | null, stmt: unknown, rows: unknown[]) => void
      }) => void
      destroy: (cb: (err: Error | null) => void) => void
    }
  }>('snowflake')
  const account = String(src.host || '').trim()
  if (!account) throw new Error('snowflake_account_required')
  const conn = snowflake.createConnection({
    account,
    username: src.username || '',
    password: src.password || '',
    database: src.database || undefined,
    warehouse: src.collection || undefined,
    schema: src.jsonPath || undefined,
  })
  await new Promise<void>((resolve, reject) => {
    conn.connect((err) => (err ? reject(err) : resolve()))
  })
  try {
    const sql = normalizeSql(String(src.sql || 'SELECT 1 AS OK'))
    const rows = await new Promise<unknown[]>((resolve, reject) => {
      conn.execute({
        sqlText: sql,
        complete: (err, _stmt, result) => {
          if (err) reject(err)
          else resolve(result || [])
        },
      })
    })
    return rowsToText(rows)
  } finally {
    await new Promise<void>((resolve) => {
      conn.destroy(() => resolve())
    })
  }
}

export async function resolveTrino(src: DataSourceConfig): Promise<string> {
  const base = String(src.url || '').replace(/\/$/, '') ||
    `http://${src.host || '127.0.0.1'}:${src.port || 8080}`
  const sql = normalizeSql(String(src.sql || 'SELECT 1'))
  const headers: Record<string, string> = {
    'Content-Type': 'text/plain',
    'X-Trino-User': src.username || 'treasure-chest',
    ...(src.headers || {}),
  }
  if (src.database?.trim()) headers['X-Trino-Catalog'] = src.database.split('.')[0] || src.database
  if (src.database?.includes('.')) headers['X-Trino-Schema'] = src.database.split('.')[1] || ''
  if (src.password) {
    headers.Authorization = `Basic ${Buffer.from(`${src.username || ''}:${src.password}`).toString('base64')}`
  }
  const first = await fetch(`${base}/v1/statement`, {
    method: 'POST',
    headers,
    body: sql,
    signal: AbortSignal.timeout(30_000),
  })
  if (!first.ok) throw new Error(`trino_${first.status}`)
  let payload = (await first.json()) as {
    data?: unknown[]
    columns?: Array<{ name: string }>
    nextUri?: string
    error?: { message?: string }
  }
  if (payload.error?.message) throw new Error(payload.error.message)
  const rows: unknown[] = []
  const colNames = payload.columns?.map((c) => c.name) || []
  const pushData = (data?: unknown[]): void => {
    if (!data) return
    for (const row of data) {
      if (Array.isArray(row) && colNames.length) {
        const obj: Record<string, unknown> = {}
        colNames.forEach((name, i) => {
          obj[name] = (row as unknown[])[i]
        })
        rows.push(obj)
      } else {
        rows.push(row)
      }
      if (rows.length >= MAX_ROWS) return
    }
  }
  pushData(payload.data)
  let guard = 0
  while (payload.nextUri && rows.length < MAX_ROWS && guard < 40) {
    guard += 1
    const next = await fetch(payload.nextUri, { signal: AbortSignal.timeout(30_000) })
    if (!next.ok) throw new Error(`trino_next_${next.status}`)
    payload = (await next.json()) as typeof payload
    if (payload.error?.message) throw new Error(payload.error.message)
    if (payload.columns?.length && !colNames.length) {
      colNames.push(...payload.columns.map((c) => c.name))
    }
    pushData(payload.data)
  }
  return rowsToText(rows)
}

export async function resolveQdrant(src: DataSourceConfig): Promise<string> {
  const base = String(src.url || '').replace(/\/$/, '')
  const collection = String(src.collection || '').trim()
  if (!base || !collection) throw new Error('url_and_collection_required')
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(src.headers || {}),
  }
  const limit = Math.min(40, Math.max(1, src.topK || 8))
  const body: Record<string, unknown> = {
    limit,
    with_payload: true,
    with_vector: false,
  }
  if (src.query?.trim()) {
    try {
      body.filter = JSON.parse(src.query)
    } catch {
      body.filter = {
        must: [{ key: 'content', match: { text: src.query.trim() } }],
      }
    }
  }
  const res = await fetch(`${base}/collections/${encodeURIComponent(collection)}/points/scroll`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`qdrant_${res.status}`)
  const json = (await res.json()) as unknown
  return JSON.stringify(json, null, 2).slice(0, MAX_CHUNK)
}

export async function resolveChroma(src: DataSourceConfig): Promise<string> {
  const base = String(src.url || '').replace(/\/$/, '')
  const collection = String(src.collection || '').trim()
  if (!base || !collection) throw new Error('url_and_collection_required')
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(src.headers || {}),
  }
  const limit = Math.min(40, Math.max(1, src.topK || 8))
  const listRes = await fetch(`${base}/api/v1/collections`, {
    headers,
    signal: AbortSignal.timeout(15_000),
  })
  if (!listRes.ok) throw new Error(`chroma_${listRes.status}`)
  const list = (await listRes.json()) as Array<{ id?: string; name?: string }>
  const hit = Array.isArray(list) ? list.find((c) => c.name === collection) : undefined
  if (!hit?.id) throw new Error('chroma_collection_not_found')
  const getRes = await fetch(`${base}/api/v1/collections/${hit.id}/get`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      limit,
      include: ['documents', 'metadatas', 'distances'],
      where_document: src.query?.trim() ? { $contains: src.query.trim() } : undefined,
    }),
    signal: AbortSignal.timeout(20_000),
  })
  if (!getRes.ok) throw new Error(`chroma_get_${getRes.status}`)
  const json = (await getRes.json()) as unknown
  return JSON.stringify(json, null, 2).slice(0, MAX_CHUNK)
}

export async function resolveDatabaseSource(src: DataSourceConfig): Promise<string> {
  const kind = src.kind as DataSourceKind
  try {
    if (kind === 'sqlite') return await resolveSqlite(src)
    if (kind === 'duckdb') return await resolveDuckdb(src)
    if (isPgWireKind(kind)) return await resolvePostgres(src)
    if (isMysqlWireKind(kind)) return await resolveMysql(src)
    if (kind === 'mssql') return await resolveMssql(src)
    if (kind === 'oracle') return await resolveOracle(src)
    if (kind === 'mongodb') return await resolveMongodb(src)
    if (kind === 'redis') return await resolveRedis(src)
    if (kind === 'clickhouse') return await resolveClickhouse(src)
    if (kind === 'cassandra') return await resolveCassandra(src)
    if (kind === 'elasticsearch') return await resolveElasticsearch(src)
    if (kind === 'influxdb') return await resolveInfluxdb(src)
    if (kind === 'dynamodb') return await resolveDynamodb(src)
    if (kind === 'snowflake') return await resolveSnowflake(src)
    if (kind === 'trino') return await resolveTrino(src)
    if (kind === 'qdrant') return await resolveQdrant(src)
    if (kind === 'chroma') return await resolveChroma(src)
    throw new Error(`unsupported_db_kind:${kind}`)
  } catch (err) {
    logger.warn(`data source db resolve failed kind=${kind}`, err)
    throw err
  }
}

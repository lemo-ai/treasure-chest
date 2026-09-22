import { app } from 'electron'
import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { DATA_SOURCE_DRIVER_INFO } from '@shared'
import { ensureNodeRuntime } from '../mcp/NodeRuntime'
import { logger } from '../../utils/logger'

const execFileAsync = promisify(execFile)

/** Default pinned versions (overridable per data source via driverVersion). */
export const ON_DEMAND_DRIVERS = {
  pg: { packageName: 'pg', version: '8.13.3' },
  mysql2: { packageName: 'mysql2', version: '3.14.0' },
  mongodb: { packageName: 'mongodb', version: '6.16.0' },
  redis: { packageName: 'redis', version: '4.7.0' },
  clickhouse: { packageName: '@clickhouse/client', version: '1.11.0' },
  mssql: { packageName: 'mssql', version: '11.0.1' },
  oracledb: { packageName: 'oracledb', version: '6.8.0' },
  duckdb: { packageName: 'duckdb', version: '1.2.2' },
  cassandra: { packageName: 'cassandra-driver', version: '4.7.2' },
  elasticsearch: { packageName: '@elastic/elasticsearch', version: '8.17.0' },
  influxdb: { packageName: '@influxdata/influxdb-client', version: '1.35.0' },
  dynamodb: { packageName: '@aws-sdk/client-dynamodb', version: '3.758.0' },
  dynamodbDoc: { packageName: '@aws-sdk/lib-dynamodb', version: '3.758.0' },
  snowflake: { packageName: 'snowflake-sdk', version: '2.0.3' },
} as const

export type OnDemandDriverId = keyof typeof ON_DEMAND_DRIVERS

export type DriverInstallStatus = {
  id: OnDemandDriverId
  packageName: string
  targetVersion: string
  installed: boolean
  installedVersion?: string
  path: string
}

function driversRoot(): string {
  return join(app.getPath('userData'), 'data-source-drivers')
}

function ensureRoot(): string {
  const root = driversRoot()
  if (!existsSync(root)) mkdirSync(root, { recursive: true })
  const pkgPath = join(root, 'package.json')
  if (!existsSync(pkgPath)) {
    writeFileSync(
      pkgPath,
      JSON.stringify(
        { name: 'treasure-chest-data-source-drivers', private: true, dependencies: {} },
        null,
        2,
      ),
      'utf8',
    )
  }
  return root
}

function readInstalledVersion(packageName: string): string | undefined {
  try {
    const pkgPath = join(driversRoot(), 'node_modules', packageName, 'package.json')
    if (!existsSync(pkgPath)) return undefined
    const raw = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string }
    return raw.version
  } catch {
    return undefined
  }
}

function sanitizeVersion(raw?: string): string | undefined {
  const v = String(raw || '').trim()
  if (!v) return undefined
  if (!/^[0-9A-Za-z.+\-_]+$/.test(v)) throw new Error('invalid_driver_version')
  return v
}

export function getDriverStatus(
  id: OnDemandDriverId,
  preferredVersion?: string,
): DriverInstallStatus {
  const spec = ON_DEMAND_DRIVERS[id]
  const targetVersion = sanitizeVersion(preferredVersion) || spec.version
  const installedVersion = readInstalledVersion(spec.packageName)
  return {
    id,
    packageName: spec.packageName,
    targetVersion,
    installed: Boolean(installedVersion),
    installedVersion,
    path: driversRoot(),
  }
}

export function listOnDemandDriverStatuses(): DriverInstallStatus[] {
  return (Object.keys(ON_DEMAND_DRIVERS) as OnDemandDriverId[]).map((id) => getDriverStatus(id))
}

/**
 * Install a driver into userData/data-source-drivers at a specific version.
 */
export async function ensureDriverInstalled(
  id: OnDemandDriverId,
  opts?: { force?: boolean; version?: string },
): Promise<DriverInstallStatus> {
  const root = ensureRoot()
  const spec = ON_DEMAND_DRIVERS[id]
  const version = sanitizeVersion(opts?.version) || spec.version
  const current = readInstalledVersion(spec.packageName)
  if (!opts?.force && current === version) {
    logger.info(`data-source driver already installed ${spec.packageName}@${current}`)
    return getDriverStatus(id, version)
  }
  if (!opts?.force && current && !opts?.version) {
    logger.info(`data-source driver already installed ${spec.packageName}@${current}`)
    return getDriverStatus(id, version)
  }

  const target = `${spec.packageName}@${version}`
  logger.info(`data-source driver installing ${target} → ${root}`)
  try {
    const runtime = await ensureNodeRuntime()
    await execFileAsync(
      runtime.npmPath,
      ['install', '--omit=dev', '--no-fund', '--no-audit', target],
      {
        cwd: root,
        env: (() => {
          const { ELECTRON_RUN_AS_NODE: _drop, ...rest } = process.env
          const pathKey = process.platform === 'win32' ? 'Path' : 'PATH'
          const prev = rest[pathKey] || rest.PATH || ''
          const nextPath = `${runtime.binDir}${process.platform === 'win32' ? ';' : ':'}${prev}`
          return { ...rest, [pathKey]: nextPath, PATH: nextPath }
        })(),
        timeout: 180_000,
        maxBuffer: 8 * 1024 * 1024,
      },
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.warn(`data-source driver install failed ${target}`, err)
    throw new Error(`driver_install_failed:${spec.packageName}:${msg}`)
  }

  const after = readInstalledVersion(spec.packageName)
  if (!after) throw new Error(`driver_install_missing:${spec.packageName}`)
  logger.info(`data-source driver ready ${spec.packageName}@${after}`)
  return getDriverStatus(id, version)
}

/** DynamoDB needs both client + document client packages. */
export async function ensureDriverInstalledWithDeps(
  id: OnDemandDriverId,
  opts?: { force?: boolean; version?: string },
): Promise<DriverInstallStatus> {
  const primary = await ensureDriverInstalled(id, opts)
  if (id === 'dynamodb') {
    await ensureDriverInstalled('dynamodbDoc', opts)
  }
  return primary
}

export function requireDriver<T = unknown>(id: OnDemandDriverId): T {
  const root = ensureRoot()
  const spec = ON_DEMAND_DRIVERS[id]
  if (!readInstalledVersion(spec.packageName)) {
    throw new Error(`driver_not_installed:${spec.packageName}`)
  }
  const req = createRequire(join(root, 'package.json'))
  return req(spec.packageName) as T
}

export function requireDriverSubpath<T = unknown>(id: OnDemandDriverId, subpath: string): T {
  const root = ensureRoot()
  const spec = ON_DEMAND_DRIVERS[id]
  if (!readInstalledVersion(spec.packageName)) {
    throw new Error(`driver_not_installed:${spec.packageName}`)
  }
  const req = createRequire(join(root, 'package.json'))
  return req(subpath) as T
}

export function driverIdForKind(kind: string): OnDemandDriverId | null {
  if (kind === 'postgres' || kind === 'cockroach' || kind === 'redshift') return 'pg'
  if (kind === 'mysql' || kind === 'mariadb' || kind === 'tidb') return 'mysql2'
  if (kind === 'mongodb') return 'mongodb'
  if (kind === 'redis') return 'redis'
  if (kind === 'clickhouse') return 'clickhouse'
  if (kind === 'mssql') return 'mssql'
  if (kind === 'oracle') return 'oracledb'
  if (kind === 'duckdb') return 'duckdb'
  if (kind === 'cassandra') return 'cassandra'
  if (kind === 'elasticsearch') return 'elasticsearch'
  if (kind === 'influxdb') return 'influxdb'
  if (kind === 'dynamodb') return 'dynamodb'
  if (kind === 'snowflake') return 'snowflake'
  return null
}

export function listDataSourceDriverCatalog() {
  const installed = new Map(listOnDemandDriverStatuses().map((s) => [s.packageName, s]))
  return DATA_SOURCE_DRIVER_INFO.map((info) => {
    const st = info.packageName ? installed.get(info.packageName) : undefined
    return {
      ...info,
      packageVersion: info.packageVersion || st?.targetVersion,
      installedVersion: st?.installedVersion,
    }
  })
}

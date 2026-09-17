/** Configurable data sources for schedule / agent context injection. */

export type DataSourceKind =
  | 'http_json'
  | 'http_text'
  | 'local_file'
  | 'static_text'
  | 'sqlite'
  | 'duckdb'
  | 'postgres'
  | 'mysql'
  | 'mariadb'
  | 'mssql'
  | 'oracle'
  | 'mongodb'
  | 'redis'
  | 'clickhouse'
  | 'cassandra'
  | 'elasticsearch'
  | 'influxdb'
  | 'dynamodb'
  | 'snowflake'
  | 'cockroach'
  | 'tidb'
  | 'redshift'
  | 'trino'
  | 'qdrant'
  | 'chroma'

export type DataSourceKindCategory = 'popular' | 'files' | 'sql' | 'nosql' | 'analytics' | 'vector'

/** How the app obtains the client/driver for a data source kind. */
export type DataSourceDriverMode = 'bundled_npm' | 'on_demand_npm' | 'http_api' | 'builtin'

export interface DataSourceDriverInfo {
  kind: DataSourceKind
  mode: DataSourceDriverMode
  packageName?: string
  /** Default / recommended version */
  packageVersion?: string
  /** Suggested versions the UI can offer */
  suggestedVersions?: string[]
  /** Currently installed version in userData (if any) */
  installedVersion?: string
  noteZh: string
  noteEn: string
}

export interface DataSourceConfig {
  id: string
  name: string
  enabled: boolean
  kind: DataSourceKind
  /** Emoji / short glyph, or data:image / https logo URL */
  icon?: string
  url?: string
  headers?: Record<string, string>
  jsonPath?: string
  path?: string
  content?: string
  host?: string
  port?: number
  database?: string
  username?: string
  password?: string
  ssl?: boolean
  sql?: string
  collection?: string
  query?: string
  topK?: number
  /** On-demand npm driver version override (e.g. 8.13.3) */
  driverVersion?: string
  updatedAt: string
}

export interface DataSourcesSettings {
  sources: DataSourceConfig[]
}

export const DEFAULT_DATA_SOURCES_SETTINGS: DataSourcesSettings = {
  sources: [],
}

export const DATA_SOURCE_KINDS: DataSourceKind[] = [
  'http_json',
  'http_text',
  'local_file',
  'static_text',
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
]

/** Default glyph when no custom icon is set. */
export const DATA_SOURCE_KIND_ICONS: Record<DataSourceKind, string> = {
  http_json: '🌐',
  http_text: '📄',
  local_file: '📁',
  static_text: '📝',
  sqlite: '🗃️',
  duckdb: '🦆',
  postgres: '🐘',
  mysql: '🐬',
  mariadb: '🦭',
  mssql: '🟦',
  oracle: '🟥',
  mongodb: '🍃',
  redis: '🔴',
  clickhouse: '⚡',
  cassandra: '👁️',
  elasticsearch: '🔍',
  influxdb: '📈',
  dynamodb: '🔶',
  snowflake: '❄️',
  cockroach: '🪳',
  tidb: '🟢',
  redshift: '🟠',
  trino: '🔺',
  qdrant: '🧲',
  chroma: '🧬',
}

/** UI grouping — mirrors common IDEs (popular first). */
export const DATA_SOURCE_KIND_CATEGORY: Record<DataSourceKind, DataSourceKindCategory> = {
  redis: 'popular',
  mysql: 'popular',
  mariadb: 'popular',
  clickhouse: 'popular',
  mongodb: 'popular',
  postgres: 'popular',
  sqlite: 'popular',
  mssql: 'popular',
  elasticsearch: 'popular',
  duckdb: 'popular',
  http_json: 'files',
  http_text: 'files',
  local_file: 'files',
  static_text: 'files',
  oracle: 'sql',
  cockroach: 'sql',
  tidb: 'sql',
  cassandra: 'nosql',
  dynamodb: 'nosql',
  influxdb: 'analytics',
  snowflake: 'analytics',
  redshift: 'analytics',
  trino: 'analytics',
  qdrant: 'vector',
  chroma: 'vector',
}

export const DATA_SOURCE_CATEGORY_ORDER: DataSourceKindCategory[] = [
  'popular',
  'files',
  'sql',
  'nosql',
  'analytics',
  'vector',
]

const ON_DEMAND_NOTE_ZH = '首次使用时下载到用户目录；可指定版本。'
const ON_DEMAND_NOTE_EN = 'Downloaded on first use; version selectable.'

export const DATA_SOURCE_DRIVER_INFO: DataSourceDriverInfo[] = [
  {
    kind: 'sqlite',
    mode: 'bundled_npm',
    packageName: 'better-sqlite3',
    noteZh: '应用已内置（主库复用），无需额外下载。',
    noteEn: 'Already bundled for the app DB.',
  },
  {
    kind: 'duckdb',
    mode: 'on_demand_npm',
    packageName: 'duckdb',
    packageVersion: '1.2.2',
    suggestedVersions: ['1.2.2', '1.1.3'],
    noteZh: ON_DEMAND_NOTE_ZH,
    noteEn: ON_DEMAND_NOTE_EN,
  },
  {
    kind: 'postgres',
    mode: 'on_demand_npm',
    packageName: 'pg',
    packageVersion: '8.13.3',
    suggestedVersions: ['8.16.0', '8.13.3', '8.11.5'],
    noteZh: ON_DEMAND_NOTE_ZH,
    noteEn: ON_DEMAND_NOTE_EN,
  },
  {
    kind: 'cockroach',
    mode: 'on_demand_npm',
    packageName: 'pg',
    packageVersion: '8.13.3',
    suggestedVersions: ['8.16.0', '8.13.3'],
    noteZh: 'PostgreSQL 线协议；使用 pg 驱动。',
    noteEn: 'Postgres wire protocol via pg.',
  },
  {
    kind: 'redshift',
    mode: 'on_demand_npm',
    packageName: 'pg',
    packageVersion: '8.13.3',
    suggestedVersions: ['8.16.0', '8.13.3'],
    noteZh: 'PostgreSQL 线协议；使用 pg 驱动。',
    noteEn: 'Postgres wire protocol via pg.',
  },
  {
    kind: 'mysql',
    mode: 'on_demand_npm',
    packageName: 'mysql2',
    packageVersion: '3.14.0',
    suggestedVersions: ['3.14.0', '3.12.0', '3.11.5'],
    noteZh: ON_DEMAND_NOTE_ZH,
    noteEn: ON_DEMAND_NOTE_EN,
  },
  {
    kind: 'mariadb',
    mode: 'on_demand_npm',
    packageName: 'mysql2',
    packageVersion: '3.14.0',
    suggestedVersions: ['3.14.0', '3.12.0'],
    noteZh: 'MySQL 兼容协议；使用 mysql2。',
    noteEn: 'MySQL-compatible via mysql2.',
  },
  {
    kind: 'tidb',
    mode: 'on_demand_npm',
    packageName: 'mysql2',
    packageVersion: '3.14.0',
    suggestedVersions: ['3.14.0', '3.12.0'],
    noteZh: 'MySQL 兼容协议；使用 mysql2。',
    noteEn: 'MySQL-compatible via mysql2.',
  },
  {
    kind: 'mssql',
    mode: 'on_demand_npm',
    packageName: 'mssql',
    packageVersion: '11.0.1',
    suggestedVersions: ['11.0.1', '10.0.4'],
    noteZh: ON_DEMAND_NOTE_ZH,
    noteEn: ON_DEMAND_NOTE_EN,
  },
  {
    kind: 'oracle',
    mode: 'on_demand_npm',
    packageName: 'oracledb',
    packageVersion: '6.8.0',
    suggestedVersions: ['6.8.0', '6.7.0'],
    noteZh: '使用 Thin 模式；首次下载到用户目录。',
    noteEn: 'Thin mode; downloaded on first use.',
  },
  {
    kind: 'mongodb',
    mode: 'on_demand_npm',
    packageName: 'mongodb',
    packageVersion: '6.16.0',
    suggestedVersions: ['6.16.0', '6.12.0', '5.9.2'],
    noteZh: ON_DEMAND_NOTE_ZH,
    noteEn: ON_DEMAND_NOTE_EN,
  },
  {
    kind: 'redis',
    mode: 'on_demand_npm',
    packageName: 'redis',
    packageVersion: '4.7.0',
    suggestedVersions: ['4.7.0', '4.6.15'],
    noteZh: ON_DEMAND_NOTE_ZH,
    noteEn: ON_DEMAND_NOTE_EN,
  },
  {
    kind: 'clickhouse',
    mode: 'on_demand_npm',
    packageName: '@clickhouse/client',
    packageVersion: '1.11.0',
    suggestedVersions: ['1.11.0', '1.8.1'],
    noteZh: ON_DEMAND_NOTE_ZH,
    noteEn: ON_DEMAND_NOTE_EN,
  },
  {
    kind: 'cassandra',
    mode: 'on_demand_npm',
    packageName: 'cassandra-driver',
    packageVersion: '4.7.2',
    suggestedVersions: ['4.7.2', '4.6.4'],
    noteZh: ON_DEMAND_NOTE_ZH,
    noteEn: ON_DEMAND_NOTE_EN,
  },
  {
    kind: 'elasticsearch',
    mode: 'on_demand_npm',
    packageName: '@elastic/elasticsearch',
    packageVersion: '8.17.0',
    suggestedVersions: ['8.17.0', '7.17.13'],
    noteZh: ON_DEMAND_NOTE_ZH,
    noteEn: ON_DEMAND_NOTE_EN,
  },
  {
    kind: 'influxdb',
    mode: 'on_demand_npm',
    packageName: '@influxdata/influxdb-client',
    packageVersion: '1.35.0',
    suggestedVersions: ['1.35.0', '1.33.2'],
    noteZh: ON_DEMAND_NOTE_ZH,
    noteEn: ON_DEMAND_NOTE_EN,
  },
  {
    kind: 'dynamodb',
    mode: 'on_demand_npm',
    packageName: '@aws-sdk/client-dynamodb',
    packageVersion: '3.758.0',
    suggestedVersions: ['3.758.0', '3.700.0'],
    noteZh: '同时安装 DynamoDB Document Client；密钥填在用户名/密码。',
    noteEn: 'Also pulls Document Client; put keys in username/password.',
  },
  {
    kind: 'snowflake',
    mode: 'on_demand_npm',
    packageName: 'snowflake-sdk',
    packageVersion: '2.0.3',
    suggestedVersions: ['2.0.3', '1.15.0'],
    noteZh: ON_DEMAND_NOTE_ZH,
    noteEn: ON_DEMAND_NOTE_EN,
  },
  {
    kind: 'trino',
    mode: 'http_api',
    noteZh: 'HTTP /v1/statement，无需本地驱动。',
    noteEn: 'HTTP /v1/statement — no local driver.',
  },
  {
    kind: 'qdrant',
    mode: 'http_api',
    noteZh: 'HTTP REST，无需本地驱动。',
    noteEn: 'HTTP REST — no local driver.',
  },
  {
    kind: 'chroma',
    mode: 'http_api',
    noteZh: 'HTTP REST，无需本地驱动。',
    noteEn: 'HTTP REST — no local driver.',
  },
  {
    kind: 'http_json',
    mode: 'builtin',
    noteZh: '内置 fetch，无需驱动。',
    noteEn: 'Built-in fetch — no driver.',
  },
  {
    kind: 'http_text',
    mode: 'builtin',
    noteZh: '内置 fetch，无需驱动。',
    noteEn: 'Built-in fetch — no driver.',
  },
  {
    kind: 'local_file',
    mode: 'builtin',
    noteZh: '直接读本机文件，无需驱动。',
    noteEn: 'Reads local files directly — no driver.',
  },
  {
    kind: 'static_text',
    mode: 'builtin',
    noteZh: '粘贴文本，无需驱动。',
    noteEn: 'Pasted text — no driver.',
  },
]

export function resolveDataSourceIcon(src: Pick<DataSourceConfig, 'kind' | 'icon'>): string {
  const custom = String(src.icon || '').trim()
  if (custom) return custom
  return DATA_SOURCE_KIND_ICONS[src.kind] || '📦'
}

export function isPgWireKind(kind: DataSourceKind): boolean {
  return kind === 'postgres' || kind === 'cockroach' || kind === 'redshift'
}

export function isMysqlWireKind(kind: DataSourceKind): boolean {
  return kind === 'mysql' || kind === 'mariadb' || kind === 'tidb'
}

export function isSqlFileKind(kind: DataSourceKind): boolean {
  return kind === 'sqlite' || kind === 'duckdb'
}

export function isSqlQueryKind(kind: DataSourceKind): boolean {
  return (
    isSqlFileKind(kind) ||
    isPgWireKind(kind) ||
    isMysqlWireKind(kind) ||
    kind === 'mssql' ||
    kind === 'oracle' ||
    kind === 'clickhouse' ||
    kind === 'cassandra' ||
    kind === 'snowflake' ||
    kind === 'trino'
  )
}

export function defaultPortForKind(kind: DataSourceKind): number | undefined {
  switch (kind) {
    case 'postgres':
      return 5432
    case 'mysql':
    case 'mariadb':
    case 'tidb':
      return 3306
    case 'mssql':
      return 1433
    case 'oracle':
      return 1521
    case 'mongodb':
      return 27017
    case 'redis':
      return 6379
    case 'clickhouse':
      return 8123
    case 'cassandra':
      return 9042
    case 'elasticsearch':
      return 9200
    case 'influxdb':
      return 8086
    case 'cockroach':
      return 26257
    case 'redshift':
      return 5439
    case 'trino':
      return 8080
    case 'qdrant':
      return 6333
    case 'chroma':
      return 8000
    default:
      return undefined
  }
}

export function kindsInCategory(category: DataSourceKindCategory): DataSourceKind[] {
  return DATA_SOURCE_KINDS.filter((k) => DATA_SOURCE_KIND_CATEGORY[k] === category)
}

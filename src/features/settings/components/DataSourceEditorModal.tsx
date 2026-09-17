import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DataSourceConfig, DataSourceDriverInfo, DataSourceKind } from '@shared'
import {
  DATA_SOURCE_CATEGORY_ORDER,
  DATA_SOURCE_KIND_ICONS,
  DATA_SOURCE_KINDS,
  defaultPortForKind,
  isMysqlWireKind,
  isPgWireKind,
  isSqlFileKind,
  isSqlQueryKind,
  kindsInCategory,
  resolveDataSourceIcon,
  type DataSourceKindCategory,
} from '@shared'
import { IconClose } from '@renderer/shared/ui/icons'
import { ToggleSwitch } from '@renderer/shared/ui/ToggleSwitch'
import { isUsableLogoUrl, logoDataUrlFromFile } from '@renderer/features/agents/lib/agentLogo'
import styles from './DataSourceEditorModal.module.css'

export type DataSourceDraft = {
  id: string
  name: string
  kind: DataSourceKind
  icon: string
  url: string
  jsonPath: string
  path: string
  content: string
  host: string
  port: string
  database: string
  username: string
  password: string
  ssl: boolean
  sql: string
  collection: string
  query: string
  topK: string
  driverVersion: string
  enabled: boolean
}

export function emptyDataSourceDraft(): DataSourceDraft {
  return {
    id: '',
    name: '',
    kind: 'mysql',
    icon: '',
    url: '',
    jsonPath: '',
    path: '',
    content: '',
    host: '',
    port: '',
    database: '',
    username: '',
    password: '',
    ssl: false,
    sql: '',
    collection: '',
    query: '',
    topK: '8',
    driverVersion: '',
    enabled: true,
  }
}

export function draftFromSource(src: DataSourceConfig): DataSourceDraft {
  return {
    id: src.id,
    name: src.name,
    kind: src.kind,
    icon: src.icon || '',
    url: src.url || '',
    jsonPath: src.jsonPath || '',
    path: src.path || '',
    content: src.content || '',
    host: src.host || '',
    port: src.port != null ? String(src.port) : '',
    database: src.database || '',
    username: src.username || '',
    password: src.password || '',
    ssl: Boolean(src.ssl),
    sql: src.sql || '',
    collection: src.collection || '',
    query: src.query || '',
    topK: src.topK != null ? String(src.topK) : '8',
    driverVersion: src.driverVersion || '',
    enabled: src.enabled,
  }
}

function usesUrlField(kind: DataSourceKind): boolean {
  return (
    kind === 'http_json' ||
    kind === 'http_text' ||
    kind === 'mongodb' ||
    kind === 'redis' ||
    kind === 'clickhouse' ||
    kind === 'elasticsearch' ||
    kind === 'influxdb' ||
    kind === 'dynamodb' ||
    kind === 'trino' ||
    kind === 'oracle' ||
    kind === 'qdrant' ||
    kind === 'chroma'
  )
}

function usesHostAuth(kind: DataSourceKind): boolean {
  return (
    isPgWireKind(kind) ||
    isMysqlWireKind(kind) ||
    kind === 'mssql' ||
    kind === 'oracle' ||
    kind === 'mongodb' ||
    kind === 'redis' ||
    kind === 'clickhouse' ||
    kind === 'cassandra' ||
    kind === 'elasticsearch' ||
    kind === 'influxdb' ||
    kind === 'dynamodb' ||
    kind === 'snowflake' ||
    kind === 'trino'
  )
}

export function draftToConfig(draft: DataSourceDraft): DataSourceConfig {
  const id = draft.id.trim() || `ds_${Date.now().toString(36)}`
  const kind = draft.kind
  const isHttp = kind === 'http_json' || kind === 'http_text'
  const isMongo = kind === 'mongodb'
  const isRedis = kind === 'redis'
  const isVector = kind === 'qdrant' || kind === 'chroma'
  const isEs = kind === 'elasticsearch'
  const isCassandra = kind === 'cassandra'
  const isInflux = kind === 'influxdb'
  const isDynamo = kind === 'dynamodb'
  const isSnowflake = kind === 'snowflake'
  const urlOptional =
    kind === 'mongodb' ||
    kind === 'redis' ||
    kind === 'clickhouse' ||
    kind === 'elasticsearch' ||
    kind === 'influxdb' ||
    kind === 'dynamodb' ||
    kind === 'trino' ||
    kind === 'oracle'

  return {
    id,
    name: draft.name.trim() || id,
    enabled: draft.enabled,
    kind,
    icon: draft.icon.trim() || undefined,
    url:
      isHttp || isVector || (urlOptional && draft.url.trim())
        ? draft.url.trim() || undefined
        : undefined,
    jsonPath:
      kind === 'http_json' || kind === 'snowflake'
        ? draft.jsonPath.trim() || undefined
        : undefined,
    path:
      kind === 'local_file' || isSqlFileKind(kind) ? draft.path.trim() || undefined : undefined,
    content: kind === 'static_text' ? draft.content : undefined,
    host: usesHostAuth(kind) ? draft.host.trim() || undefined : undefined,
    port: draft.port.trim() ? Number(draft.port) : undefined,
    database: draft.database.trim() || undefined,
    username: usesHostAuth(kind) ? draft.username.trim() || undefined : undefined,
    password: usesHostAuth(kind) ? draft.password || undefined : undefined,
    ssl:
      isPgWireKind(kind) || isMysqlWireKind(kind) || kind === 'mssql' ? draft.ssl : undefined,
    sql: isSqlQueryKind(kind) ? draft.sql.trim() || undefined : undefined,
    collection:
      isMongo ||
      isVector ||
      isEs ||
      isCassandra ||
      isDynamo ||
      isSnowflake
        ? draft.collection.trim() || undefined
        : undefined,
    query:
      isMongo ||
      isVector ||
      isRedis ||
      isEs ||
      isInflux ||
      isDynamo ||
      isCassandra
        ? draft.query.trim() || undefined
        : undefined,
    topK:
      (isVector || isEs || isDynamo) && draft.topK.trim()
        ? Number(draft.topK)
        : undefined,
    driverVersion: draft.driverVersion.trim() || undefined,
    updatedAt: new Date().toISOString(),
  }
}

interface DataSourceEditorModalProps {
  initial: DataSourceDraft
  drivers: DataSourceDriverInfo[]
  busy?: boolean
  statusMsg?: string | null
  onClose: () => void
  onSave: (config: DataSourceConfig) => void
  onTest: (config: DataSourceConfig) => void | Promise<void>
  onPickFile: () => Promise<string | null>
}

function categoryLabelKey(cat: DataSourceKindCategory): string {
  switch (cat) {
    case 'popular':
      return 'settings.dataSources.groupPopular'
    case 'files':
      return 'settings.dataSources.groupFiles'
    case 'sql':
      return 'settings.dataSources.groupSql'
    case 'nosql':
      return 'settings.dataSources.groupNosql'
    case 'analytics':
      return 'settings.dataSources.groupAnalytics'
    case 'vector':
      return 'settings.dataSources.groupVector'
  }
}

function kindLabelKey(kind: DataSourceKind): string {
  return `settings.dataSources.kindLabel.${kind}`
}

export function DataSourceEditorModal({
  initial,
  drivers,
  busy,
  statusMsg,
  onClose,
  onSave,
  onTest,
  onPickFile,
}: DataSourceEditorModalProps): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const isEdit = Boolean(initial.id)
  const [draft, setDraft] = useState<DataSourceDraft>(initial)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const driver = useMemo(
    () => drivers.find((d) => d.kind === draft.kind),
    [drivers, draft.kind],
  )

  const iconValue = resolveDataSourceIcon({ kind: draft.kind, icon: draft.icon })
  const iconIsImage = isUsableLogoUrl(iconValue)
  const portPlaceholder = String(defaultPortForKind(draft.kind) || '')

  const submit = (): void => {
    if (!draft.name.trim()) {
      setError(t('settings.dataSources.needName'))
      return
    }
    setError('')
    onSave(draftToConfig(draft))
  }

  const onIconFile = async (file: File | undefined): Promise<void> => {
    if (!file) return
    try {
      const dataUrl = await logoDataUrlFromFile(file)
      setDraft((d) => ({ ...d, icon: dataUrl }))
    } catch {
      setError(t('settings.dataSources.iconFailed'))
    }
  }

  const pickKind = (kind: DataSourceKind): void => {
    const info = drivers.find((d) => d.kind === kind)
    const port = defaultPortForKind(kind)
    setDraft((d) => ({
      ...d,
      kind,
      port: d.port || (port != null ? String(port) : ''),
      driverVersion: info?.packageVersion || '',
    }))
  }

  return (
    <div className={styles.backdrop} onClick={onClose} role="presentation">
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ds-editor-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.head}>
          <h2 id="ds-editor-title" className={styles.title}>
            {isEdit ? t('settings.dataSources.modalEdit') : t('settings.dataSources.modalAdd')}
          </h2>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label={t('settings.dataSources.cancel')}
          >
            <IconClose />
          </button>
        </div>

        <div className={styles.field}>
          <span>{t('settings.dataSources.icon')}</span>
          <div className={styles.iconRow}>
            <div className={styles.iconPreview} aria-hidden>
              {iconIsImage ? <img src={iconValue} alt="" /> : iconValue}
            </div>
            <div className={styles.iconActions}>
              <input
                value={draft.icon}
                placeholder={t('settings.dataSources.iconPlaceholder')}
                onChange={(e) => setDraft((d) => ({ ...d, icon: e.target.value }))}
              />
              <button type="button" className={styles.ghostBtn} onClick={() => fileRef.current?.click()}>
                {t('settings.dataSources.iconUpload')}
              </button>
              <button
                type="button"
                className={styles.ghostBtn}
                onClick={() =>
                  setDraft((d) => ({ ...d, icon: DATA_SOURCE_KIND_ICONS[d.kind] || '' }))
                }
              >
                {t('settings.dataSources.iconDefault')}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => void onIconFile(e.target.files?.[0])}
              />
            </div>
          </div>
        </div>

        <label className={styles.field}>
          <span>{t('settings.dataSources.name')}</span>
          <input
            value={draft.name}
            autoFocus
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          />
        </label>

        <div className={styles.field}>
          <span>{t('settings.dataSources.kind')}</span>
          <div className={styles.kindGroups}>
            {DATA_SOURCE_CATEGORY_ORDER.map((cat) => {
              const kinds = kindsInCategory(cat)
              if (!kinds.length) return null
              return (
                <div key={cat} className={styles.kindGroup}>
                  <div className={styles.kindGroupTitle}>{t(categoryLabelKey(cat))}</div>
                  <div className={styles.kindGrid}>
                    {kinds.map((kind) => {
                      const active = draft.kind === kind
                      return (
                        <button
                          key={kind}
                          type="button"
                          className={`${styles.kindChip} ${active ? styles.kindChipActive : ''}`}
                          onClick={() => pickKind(kind)}
                        >
                          <span className={styles.kindChipIcon} aria-hidden>
                            {DATA_SOURCE_KIND_ICONS[kind]}
                          </span>
                          <span>{t(kindLabelKey(kind), { defaultValue: kind })}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
          {!DATA_SOURCE_KINDS.includes(draft.kind) ? (
            <p className={styles.error}>{draft.kind}</p>
          ) : null}
        </div>

        {driver ? (
          <p className={styles.hint}>
            {i18n.language.startsWith('en') ? driver.noteEn : driver.noteZh}
            {driver.packageName
              ? ` · ${driver.packageName}${driver.installedVersion ? `@${driver.installedVersion}` : ''}`
              : ''}
          </p>
        ) : null}

        {driver?.mode === 'on_demand_npm' ? (
          <label className={styles.field}>
            <span>{t('settings.dataSources.driverVersion')}</span>
            <input
              list={`ds-driver-versions-${draft.kind}`}
              value={draft.driverVersion}
              placeholder={driver.packageVersion || 'latest'}
              onChange={(e) => setDraft((d) => ({ ...d, driverVersion: e.target.value }))}
            />
            <datalist id={`ds-driver-versions-${draft.kind}`}>
              {(driver.suggestedVersions || []).map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
          </label>
        ) : null}

        {draft.kind === 'http_json' || draft.kind === 'http_text' ? (
          <label className={styles.field}>
            <span>URL</span>
            <input
              value={draft.url}
              placeholder={
                draft.kind === 'http_json'
                  ? 'https://api.example.com/data.json'
                  : 'https://example.com/notes.md'
              }
              onChange={(e) => setDraft((d) => ({ ...d, url: e.target.value }))}
            />
          </label>
        ) : null}

        {draft.kind === 'http_json' ? (
          <label className={styles.field}>
            <span>{t('settings.dataSources.jsonPath')}</span>
            <input
              value={draft.jsonPath}
              onChange={(e) => setDraft((d) => ({ ...d, jsonPath: e.target.value }))}
            />
          </label>
        ) : null}

        {draft.kind === 'local_file' || isSqlFileKind(draft.kind) ? (
          <div className={styles.field}>
            <span>
              {isSqlFileKind(draft.kind)
                ? t('settings.dataSources.dbPath')
                : t('settings.dataSources.path')}
            </span>
            <div className={styles.pathRow}>
              <input
                value={draft.path}
                placeholder={
                  draft.kind === 'duckdb'
                    ? t('settings.dataSources.duckdbPathPlaceholder')
                    : t('settings.dataSources.pathPlaceholder')
                }
                onChange={(e) => setDraft((d) => ({ ...d, path: e.target.value }))}
              />
              <button
                type="button"
                className={styles.ghostBtn}
                onClick={() => {
                  void onPickFile().then((picked) => {
                    if (!picked) return
                    setDraft((d) => ({
                      ...d,
                      path: picked,
                      name: d.name.trim() || picked.split(/[/\\]/).pop() || d.name,
                    }))
                  })
                }}
              >
                {t('settings.dataSources.browse')}
              </button>
            </div>
          </div>
        ) : null}

        {usesHostAuth(draft.kind) ? (
          <>
            {usesUrlField(draft.kind) &&
            draft.kind !== 'http_json' &&
            draft.kind !== 'http_text' &&
            draft.kind !== 'qdrant' &&
            draft.kind !== 'chroma' ? (
              <label className={styles.field}>
                <span>
                  {draft.kind === 'mongodb'
                    ? t('settings.dataSources.mongoUrl')
                    : draft.kind === 'redis'
                      ? t('settings.dataSources.redisUrl')
                      : draft.kind === 'clickhouse'
                        ? t('settings.dataSources.clickhouseUrl')
                        : draft.kind === 'elasticsearch'
                          ? t('settings.dataSources.esUrl')
                          : draft.kind === 'influxdb'
                            ? t('settings.dataSources.influxUrl')
                            : draft.kind === 'dynamodb'
                              ? t('settings.dataSources.dynamoEndpoint')
                              : draft.kind === 'oracle'
                                ? t('settings.dataSources.oracleConnect')
                                : draft.kind === 'trino'
                                  ? t('settings.dataSources.trinoUrl')
                                  : 'URL'}
                </span>
                <input
                  value={draft.url}
                  placeholder={
                    draft.kind === 'mongodb'
                      ? 'mongodb://user:pass@host:27017'
                      : draft.kind === 'redis'
                        ? 'redis://:pass@127.0.0.1:6379/0'
                        : draft.kind === 'elasticsearch'
                          ? 'http://127.0.0.1:9200'
                          : draft.kind === 'influxdb'
                            ? 'http://127.0.0.1:8086'
                            : draft.kind === 'trino'
                              ? 'http://127.0.0.1:8080'
                              : draft.kind === 'oracle'
                                ? 'host:1521/ORCL'
                                : 'http://127.0.0.1'
                  }
                  onChange={(e) => setDraft((d) => ({ ...d, url: e.target.value }))}
                />
              </label>
            ) : null}

            {draft.kind === 'qdrant' || draft.kind === 'chroma' ? (
              <label className={styles.field}>
                <span>URL</span>
                <input
                  value={draft.url}
                  placeholder={
                    draft.kind === 'qdrant' ? 'http://127.0.0.1:6333' : 'http://127.0.0.1:8000'
                  }
                  onChange={(e) => setDraft((d) => ({ ...d, url: e.target.value }))}
                />
              </label>
            ) : null}

            {draft.kind !== 'snowflake' && draft.kind !== 'dynamodb' ? (
              <div className={styles.row}>
                <label className={styles.field}>
                  <span>
                    {draft.kind === 'influxdb'
                      ? t('settings.dataSources.influxOrg')
                      : t('settings.dataSources.host')}
                  </span>
                  <input
                    value={draft.kind === 'influxdb' ? draft.username : draft.host}
                    placeholder={draft.kind === 'influxdb' ? 'my-org' : '127.0.0.1'}
                    onChange={(e) =>
                      draft.kind === 'influxdb'
                        ? setDraft((d) => ({ ...d, username: e.target.value }))
                        : setDraft((d) => ({ ...d, host: e.target.value }))
                    }
                  />
                </label>
                {draft.kind !== 'influxdb' ? (
                  <label className={styles.field}>
                    <span>{t('settings.dataSources.port')}</span>
                    <input
                      value={draft.port}
                      placeholder={portPlaceholder}
                      onChange={(e) => setDraft((d) => ({ ...d, port: e.target.value }))}
                    />
                  </label>
                ) : (
                  <label className={styles.field}>
                    <span>{t('settings.dataSources.influxToken')}</span>
                    <input
                      type="password"
                      value={draft.password}
                      onChange={(e) => setDraft((d) => ({ ...d, password: e.target.value }))}
                    />
                  </label>
                )}
              </div>
            ) : null}

            {draft.kind === 'snowflake' ? (
              <>
                <label className={styles.field}>
                  <span>{t('settings.dataSources.snowflakeAccount')}</span>
                  <input
                    value={draft.host}
                    placeholder="xy12345.us-east-1"
                    onChange={(e) => setDraft((d) => ({ ...d, host: e.target.value }))}
                  />
                </label>
                <label className={styles.field}>
                  <span>{t('settings.dataSources.snowflakeWarehouse')}</span>
                  <input
                    value={draft.collection}
                    onChange={(e) => setDraft((d) => ({ ...d, collection: e.target.value }))}
                  />
                </label>
                <label className={styles.field}>
                  <span>{t('settings.dataSources.snowflakeSchema')}</span>
                  <input
                    value={draft.jsonPath}
                    onChange={(e) => setDraft((d) => ({ ...d, jsonPath: e.target.value }))}
                  />
                </label>
              </>
            ) : null}

            {draft.kind === 'dynamodb' ? (
              <>
                <label className={styles.field}>
                  <span>{t('settings.dataSources.awsRegion')}</span>
                  <input
                    value={draft.host}
                    placeholder="us-east-1"
                    onChange={(e) => setDraft((d) => ({ ...d, host: e.target.value }))}
                  />
                </label>
                <label className={styles.field}>
                  <span>{t('settings.dataSources.dynamoTable')}</span>
                  <input
                    value={draft.collection}
                    onChange={(e) => setDraft((d) => ({ ...d, collection: e.target.value }))}
                  />
                </label>
              </>
            ) : null}

            {draft.kind !== 'influxdb' ? (
              <>
                <label className={styles.field}>
                  <span>
                    {draft.kind === 'redis'
                      ? t('settings.dataSources.redisDb')
                      : draft.kind === 'cassandra'
                        ? t('settings.dataSources.keyspace')
                        : draft.kind === 'trino'
                          ? t('settings.dataSources.trinoCatalog')
                          : t('settings.dataSources.database')}
                  </span>
                  <input
                    value={draft.database}
                    placeholder={
                      draft.kind === 'redis'
                        ? '0'
                        : draft.kind === 'trino'
                          ? 'catalog.schema'
                          : undefined
                    }
                    onChange={(e) => setDraft((d) => ({ ...d, database: e.target.value }))}
                  />
                </label>
                <div className={styles.row}>
                  <label className={styles.field}>
                    <span>
                      {draft.kind === 'dynamodb'
                        ? t('settings.dataSources.awsAccessKey')
                        : t('settings.dataSources.username')}
                    </span>
                    <input
                      value={draft.username}
                      onChange={(e) => setDraft((d) => ({ ...d, username: e.target.value }))}
                    />
                  </label>
                  <label className={styles.field}>
                    <span>
                      {draft.kind === 'dynamodb'
                        ? t('settings.dataSources.awsSecretKey')
                        : t('settings.dataSources.password')}
                    </span>
                    <input
                      type="password"
                      value={draft.password}
                      onChange={(e) => setDraft((d) => ({ ...d, password: e.target.value }))}
                    />
                  </label>
                </div>
              </>
            ) : (
              <label className={styles.field}>
                <span>{t('settings.dataSources.influxBucket')}</span>
                <input
                  value={draft.database}
                  onChange={(e) => setDraft((d) => ({ ...d, database: e.target.value }))}
                />
              </label>
            )}

            {isPgWireKind(draft.kind) || isMysqlWireKind(draft.kind) || draft.kind === 'mssql' ? (
              <div className={styles.toggleRow}>
                <span className={styles.toggleLabel}>SSL</span>
                <ToggleSwitch
                  checked={draft.ssl}
                  label="SSL"
                  onChange={(ssl) => setDraft((d) => ({ ...d, ssl }))}
                />
              </div>
            ) : null}

            {draft.kind === 'cassandra' ? (
              <label className={styles.field}>
                <span>{t('settings.dataSources.cassandraDc')}</span>
                <input
                  value={draft.collection}
                  placeholder="datacenter1"
                  onChange={(e) => setDraft((d) => ({ ...d, collection: e.target.value }))}
                />
              </label>
            ) : null}

            {draft.kind === 'elasticsearch' ||
            draft.kind === 'mongodb' ||
            draft.kind === 'qdrant' ||
            draft.kind === 'chroma' ? (
              <label className={styles.field}>
                <span>
                  {draft.kind === 'elasticsearch'
                    ? t('settings.dataSources.esIndex')
                    : t('settings.dataSources.collection')}
                </span>
                <input
                  value={draft.collection}
                  onChange={(e) => setDraft((d) => ({ ...d, collection: e.target.value }))}
                />
              </label>
            ) : null}
          </>
        ) : null}

        {isSqlQueryKind(draft.kind) ? (
          <label className={styles.field}>
            <span>
              {draft.kind === 'cassandra'
                ? t('settings.dataSources.cql')
                : t('settings.dataSources.sql')}
            </span>
            <textarea
              rows={3}
              value={draft.sql}
              placeholder={
                draft.kind === 'cassandra'
                  ? t('settings.dataSources.cqlPlaceholder')
                  : t('settings.dataSources.sqlPlaceholder')
              }
              onChange={(e) => setDraft((d) => ({ ...d, sql: e.target.value }))}
            />
          </label>
        ) : null}

        {draft.kind === 'redis' ? (
          <label className={styles.field}>
            <span>{t('settings.dataSources.redisCommand')}</span>
            <textarea
              rows={2}
              value={draft.query}
              placeholder="GET mykey  /  KEYS *  /  PING"
              onChange={(e) => setDraft((d) => ({ ...d, query: e.target.value }))}
            />
          </label>
        ) : null}

        {draft.kind === 'influxdb' ? (
          <label className={styles.field}>
            <span>{t('settings.dataSources.fluxQuery')}</span>
            <textarea
              rows={3}
              value={draft.query}
              placeholder={'from(bucket:"x") |> range(start: -1h)'}
              onChange={(e) => setDraft((d) => ({ ...d, query: e.target.value }))}
            />
          </label>
        ) : null}

        {draft.kind === 'mongodb' ||
        draft.kind === 'elasticsearch' ||
        draft.kind === 'dynamodb' ||
        draft.kind === 'qdrant' ||
        draft.kind === 'chroma' ? (
          <>
            <label className={styles.field}>
              <span>{t('settings.dataSources.query')}</span>
              <textarea
                rows={2}
                value={draft.query}
                placeholder={
                  draft.kind === 'mongodb' || draft.kind === 'dynamodb'
                    ? '{ ... }'
                    : draft.kind === 'elasticsearch'
                      ? 'status:active  or  { "query": { ... } }'
                      : t('settings.dataSources.queryHint')
                }
                onChange={(e) => setDraft((d) => ({ ...d, query: e.target.value }))}
              />
            </label>
            {draft.kind !== 'mongodb' ? (
              <label className={styles.field}>
                <span>topK</span>
                <input
                  value={draft.topK}
                  onChange={(e) => setDraft((d) => ({ ...d, topK: e.target.value }))}
                />
              </label>
            ) : null}
          </>
        ) : null}

        {draft.kind === 'static_text' ? (
          <label className={styles.field}>
            <span>{t('settings.dataSources.content')}</span>
            <textarea
              rows={4}
              value={draft.content}
              onChange={(e) => setDraft((d) => ({ ...d, content: e.target.value }))}
            />
          </label>
        ) : null}

        <div className={styles.toggleRow}>
          <span className={styles.toggleLabel}>{t('settings.dataSources.enabled')}</span>
          <ToggleSwitch
            checked={draft.enabled}
            label={t('settings.dataSources.enabled')}
            onChange={(enabled) => setDraft((d) => ({ ...d, enabled }))}
          />
        </div>

        {error ? <p className={styles.error}>{error}</p> : null}
        {statusMsg ? <p className={styles.hint}>{statusMsg}</p> : null}

        <div className={styles.actions}>
          <button type="button" className={styles.cancel} onClick={onClose}>
            {t('settings.dataSources.cancel')}
          </button>
          <button
            type="button"
            className={styles.cancel}
            disabled={busy}
            onClick={() => {
              if (!draft.name.trim()) {
                setError(t('settings.dataSources.needName'))
                return
              }
              setError('')
              void onTest(draftToConfig(draft))
            }}
          >
            {busy ? t('settings.dataSources.testing') : t('settings.dataSources.test')}
          </button>
          <button type="button" className={styles.save} disabled={busy} onClick={submit}>
            {busy ? t('settings.dataSources.driverDownloading') : t('settings.dataSources.save')}
          </button>
        </div>
      </div>
    </div>
  )
}

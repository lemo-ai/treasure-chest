import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DataSourceConfig, DataSourceDriverInfo, DataSourceKind } from '@shared'
import { defaultPortForKind, resolveDataSourceIcon } from '@shared'
import { isUsableLogoUrl } from '@renderer/features/agents/lib/agentLogo'
import { IconPlus } from '@renderer/shared/ui/icons'
import {
  DataSourceEditorModal,
  draftFromSource,
  emptyDataSourceDraft,
  type DataSourceDraft,
} from './DataSourceEditorModal'
import styles from './DataSourcesPanel.module.css'

function sourceSummary(src: DataSourceConfig): string {
  if (
    src.kind === 'http_json' ||
    src.kind === 'http_text' ||
    src.kind === 'qdrant' ||
    src.kind === 'chroma' ||
    src.kind === 'elasticsearch' ||
    src.kind === 'influxdb' ||
    src.kind === 'trino'
  ) {
    return src.url || `${src.host || ''}${src.port ? `:${src.port}` : ''}` || '—'
  }
  if (src.kind === 'local_file' || src.kind === 'sqlite' || src.kind === 'duckdb') {
    return src.path || '—'
  }
  if (src.kind === 'static_text') return (src.content || '').slice(0, 80) || '—'
  if (src.kind === 'snowflake') return src.host || '—'
  if (src.kind === 'dynamodb') {
    return `${src.host || 'region'}${src.collection ? ` / ${src.collection}` : ''}`
  }
  const port = src.port || defaultPortForKind(src.kind)
  return (
    src.url ||
    `${src.host || ''}${port ? `:${port}` : ''}${src.database ? ` / ${src.database}` : ''}${src.collection ? ` · ${src.collection}` : ''}` ||
    '—'
  )
}

const DRIVER_KINDS = new Set<DataSourceKind>([
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
  'duckdb',
  'cockroach',
  'tidb',
  'redshift',
])

interface DataSourcesPanelProps {
  sources: DataSourceConfig[]
  onSourcesChange: (next: DataSourceConfig[]) => void
}

export function DataSourcesPanel({
  sources,
  onSourcesChange,
}: DataSourcesPanelProps): React.JSX.Element {
  const { t } = useTranslation()
  const [drivers, setDrivers] = useState<DataSourceDriverInfo[]>([])
  const [editor, setEditor] = useState<DataSourceDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)

  useEffect(() => {
    void window.treasureChest.listDataSourceDrivers().then(setDrivers).catch(() => setDrivers([]))
  }, [])

  const needsDriver = (kind: DataSourceKind): boolean => DRIVER_KINDS.has(kind)

  const ensureDriverIfNeeded = async (
    kind: DataSourceKind,
    version?: string,
  ): Promise<boolean> => {
    if (!needsDriver(kind)) return true
    setBusy(true)
    setStatusMsg(t('settings.dataSources.driverDownloading'))
    try {
      const r = await window.treasureChest.ensureDataSourceDriver(kind, version)
      if (!r.ok) {
        setStatusMsg(t('settings.dataSources.driverFailed', { error: r.error || 'error' }))
        return false
      }
      setStatusMsg(t('settings.dataSources.driverReady'))
      void window.treasureChest.listDataSourceDrivers().then(setDrivers)
      return true
    } catch (err) {
      setStatusMsg(
        t('settings.dataSources.driverFailed', {
          error: err instanceof Error ? err.message : String(err),
        }),
      )
      return false
    } finally {
      setBusy(false)
    }
  }

  const openAdd = (): void => {
    setStatusMsg(null)
    setEditor(emptyDataSourceDraft())
  }

  const openEdit = (src: DataSourceConfig): void => {
    setStatusMsg(null)
    setEditor(draftFromSource(src))
  }

  const runTest = async (payload: DataSourceConfig): Promise<void> => {
    const ok = await ensureDriverIfNeeded(payload.kind, payload.driverVersion)
    if (!ok) return
    setBusy(true)
    setStatusMsg(t('settings.dataSources.testing'))
    try {
      const r = await window.treasureChest.testDataSource(payload)
      if (r.ok) {
        setStatusMsg(
          t('settings.dataSources.testOk', {
            ms: r.latencyMs ?? 0,
          }),
        )
        setPreview(r.text || '')
      } else {
        setStatusMsg(t('settings.dataSources.testFail', { error: r.error || 'error' }))
        setPreview(r.error || 'error')
      }
    } catch (err) {
      setStatusMsg(
        t('settings.dataSources.testFail', {
          error: err instanceof Error ? err.message : String(err),
        }),
      )
    } finally {
      setBusy(false)
    }
  }

  const onSave = (payload: DataSourceConfig): void => {
    void (async () => {
      const ok = await ensureDriverIfNeeded(payload.kind, payload.driverVersion)
      if (!ok) return
      const saved = await window.treasureChest.upsertDataSource(payload)
      const idx = sources.findIndex((s) => s.id === saved.id)
      if (idx >= 0) {
        const copy = [...sources]
        copy[idx] = saved
        onSourcesChange(copy)
      } else {
        onSourcesChange([...sources, saved])
      }
      setEditor(null)
      setStatusMsg(null)
    })()
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <div className={styles.headText}>
          <h2 className={styles.title}>{t('settings.dataSources.title')}</h2>
          <p className={styles.desc}>{t('settings.dataSources.desc')}</p>
        </div>
        {sources.length > 0 ? (
          <button type="button" className={styles.addBtn} onClick={openAdd}>
            <IconPlus />
            {t('settings.dataSources.add')}
          </button>
        ) : null}
      </div>

      {sources.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon} aria-hidden>
            🗄️
          </div>
          <h3 className={styles.emptyTitle}>{t('settings.dataSources.emptyTitle')}</h3>
          <p className={styles.emptyDesc}>{t('settings.dataSources.emptyDesc')}</p>
          <button type="button" className={styles.addBtn} onClick={openAdd}>
            <IconPlus />
            {t('settings.dataSources.add')}
          </button>
        </div>
      ) : (
        <div className={styles.grid}>
          {sources.map((src) => {
            const icon = resolveDataSourceIcon(src)
            const image = isUsableLogoUrl(icon)
            return (
              <article key={src.id} className={styles.card}>
                <div className={styles.cardTop}>
                  <div className={styles.icon} aria-hidden>
                    {image ? <img src={icon} alt="" /> : icon}
                  </div>
                  <div className={styles.meta}>
                    <h3 className={styles.name}>{src.name}</h3>
                    <p className={styles.kind}>
                      {t(`settings.dataSources.kindLabel.${src.kind}`, { defaultValue: src.kind })}
                      {src.driverVersion ? ` · v${src.driverVersion}` : ''}
                    </p>
                  </div>
                </div>
                <p className={styles.summary}>{sourceSummary(src)}</p>
                <div className={styles.badges}>
                  <span className={`${styles.badge} ${src.enabled ? styles.badgeOn : styles.badgeOff}`}>
                    {src.enabled
                      ? t('settings.dataSources.badgeOn')
                      : t('settings.dataSources.badgeOff')}
                  </span>
                </div>
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.action}
                    disabled={busy}
                    onClick={() => void runTest(src)}
                  >
                    {t('settings.dataSources.test')}
                  </button>
                  <button
                    type="button"
                    className={styles.action}
                    onClick={() => {
                      void (async () => {
                        const ok = await ensureDriverIfNeeded(src.kind, src.driverVersion)
                        if (!ok) return
                        const r = await window.treasureChest.previewDataSource(src.id)
                        setPreview(r.ok ? r.text || '' : r.error || 'error')
                      })()
                    }}
                  >
                    {t('settings.dataSources.preview')}
                  </button>
                  <button type="button" className={styles.action} onClick={() => openEdit(src)}>
                    {t('settings.dataSources.edit')}
                  </button>
                  <button
                    type="button"
                    className={`${styles.action} ${styles.actionDanger}`}
                    onClick={() => {
                      void window.treasureChest.deleteDataSource(src.id).then((ok) => {
                        if (ok) onSourcesChange(sources.filter((s) => s.id !== src.id))
                      })
                    }}
                  >
                    {t('settings.dataSources.delete')}
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {statusMsg && !editor ? <p className={styles.status}>{statusMsg}</p> : null}
      {preview != null ? <pre className={styles.preview}>{preview}</pre> : null}

      {editor ? (
        <DataSourceEditorModal
          initial={editor}
          drivers={drivers}
          busy={busy}
          statusMsg={statusMsg}
          onClose={() => {
            setEditor(null)
            setStatusMsg(null)
          }}
          onSave={onSave}
          onTest={(payload) => void runTest(payload)}
          onPickFile={() => window.treasureChest.pickDataSourceFile()}
        />
      ) : null}
    </div>
  )
}

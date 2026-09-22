import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ActivityLogEntry, ActivityLogLevel, DebugLogSettings, DebugWriteLevel } from '@shared'
import { DEFAULT_DEBUG_LOG_SETTINGS } from '@shared'
import styles from './DebugPanel.module.css'

const SCOPES = ['all', 'llm', 'mcp', 'main', 'image', 'app'] as const
const VIEW_LEVELS: Array<'all' | ActivityLogLevel> = ['all', 'info', 'warn', 'error']
const WRITE_LEVELS: DebugWriteLevel[] = ['error', 'warn', 'info', 'debug']
const RETENTION_OPTIONS = [3, 7, 14, 30, 60, 90] as const
const TIME_RANGES = ['all', '1h', '24h', '7d', 'today'] as const

type TimeRange = (typeof TIME_RANGES)[number]
type Tab = 'live' | 'file' | 'prefs'

const ACTIVITY_SIZE_OPTIONS = [500, 1000, 2000, 3000, 5000] as const

function scopeLabelKey(scope: (typeof SCOPES)[number]): string {
  if (scope === 'all') return 'settings.debugScopeAll'
  if (scope === 'llm') return 'settings.debugScope.llm'
  if (scope === 'mcp') return 'settings.debugScope.mcp'
  if (scope === 'main') return 'settings.debugScope.main'
  if (scope === 'image') return 'settings.debugScope.image'
  return 'settings.debugScope.app'
}

function viewLevelLabelKey(level: (typeof VIEW_LEVELS)[number]): string {
  if (level === 'all') return 'settings.debugLevelAll'
  if (level === 'info') return 'settings.debugLevel.info'
  if (level === 'warn') return 'settings.debugLevel.warn'
  return 'settings.debugLevel.error'
}

function writeLevelLabelKey(level: DebugWriteLevel): string {
  if (level === 'error') return 'settings.debugWriteLevel.error'
  if (level === 'warn') return 'settings.debugWriteLevel.warn'
  if (level === 'info') return 'settings.debugWriteLevel.info'
  return 'settings.debugWriteLevel.debug'
}

function timeRangeLabelKey(range: TimeRange): string {
  if (range === 'all') return 'settings.debugTimeRange.all'
  if (range === '1h') return 'settings.debugTimeRange.1h'
  if (range === '24h') return 'settings.debugTimeRange.24h'
  if (range === '7d') return 'settings.debugTimeRange.7d'
  return 'settings.debugTimeRange.today'
}

function sinceForRange(range: TimeRange): number | undefined {
  const now = Date.now()
  if (range === 'all') return undefined
  if (range === '1h') return now - 60 * 60 * 1000
  if (range === '24h') return now - 24 * 60 * 60 * 1000
  if (range === '7d') return now - 7 * 24 * 60 * 60 * 1000
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  return start.getTime()
}

function formatTime(ts: number, showDate: boolean): string {
  try {
    const d = new Date(ts)
    if (showDate) {
      return d.toLocaleString(undefined, {
        hour12: false,
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    }
    return d.toLocaleTimeString(undefined, {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return String(ts)
  }
}

export function DebugPanel(): React.JSX.Element {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('live')
  const [entries, setEntries] = useState<ActivityLogEntry[]>([])
  const [mainLogPath, setMainLogPath] = useState('')
  const [mainTail, setMainTail] = useState('')
  const [scope, setScope] = useState<(typeof SCOPES)[number]>('all')
  const [viewLevel, setViewLevel] = useState<(typeof VIEW_LEVELS)[number]>('all')
  const [timeRange, setTimeRange] = useState<TimeRange>('24h')
  const [logSettings, setLogSettings] = useState<DebugLogSettings>(DEFAULT_DEBUG_LOG_SETTINGS)
  const [hint, setHint] = useState('')
  const [saving, setSaving] = useState(false)

  const refresh = useCallback(async () => {
    const snap = await window.treasureChest.getDebugActivity({
      scope: scope === 'all' ? undefined : scope,
      level: viewLevel === 'all' ? undefined : viewLevel,
      sinceTs: sinceForRange(timeRange),
      limit: 400,
    })
    setEntries(snap.entries)
    setMainLogPath(snap.mainLogPath)
    setLogSettings(snap.settings)
  }, [scope, viewLevel, timeRange])

  const loadTail = useCallback(async () => {
    const text = await window.treasureChest.readDebugMainLogTail()
    setMainTail(text)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    return window.treasureChest.onDebugActivityAppended(() => {
      void refresh()
    })
  }, [refresh])

  useEffect(() => {
    if (tab === 'file') void loadTail()
  }, [tab, loadTail])

  const filtered = useMemo(() => [...entries].reverse(), [entries])
  const showDate = timeRange === 'all' || timeRange === '7d'

  const flash = (msg: string): void => {
    setHint(msg)
    window.setTimeout(() => setHint(''), 2200)
  }

  const saveSettings = async (partial: Partial<DebugLogSettings>): Promise<void> => {
    setSaving(true)
    try {
      const next = await window.treasureChest.setDebugLogSettings(partial)
      setLogSettings(next)
      flash(t('settings.debugSettingsSaved'))
    } finally {
      setSaving(false)
    }
  }

  const onClear = async (): Promise<void> => {
    await window.treasureChest.clearDebugActivity()
    flash(t('settings.debugCleared'))
    await refresh()
  }

  const onCopy = async (): Promise<void> => {
    const text =
      tab === 'file'
        ? mainTail
        : filtered
            .map(
              (e) =>
                `${new Date(e.ts).toISOString()} [${e.level}] [${e.scope}] ${e.message}${
                  e.detail ? ` | ${e.detail}` : ''
                }`,
            )
            .join('\n')
    await navigator.clipboard.writeText(text)
    flash(t('settings.debugCopied'))
  }

  const onOpenLog = async (): Promise<void> => {
    const path = await window.treasureChest.openDebugMainLog()
    flash(t('settings.debugOpenedLog', { path }))
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>{t('settings.debugTitle')}</h2>
          <p className={styles.desc}>{t('settings.debugHintShort')}</p>
        </div>
        <div className={styles.tabs} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'live'}
            className={tab === 'live' ? styles.tabActive : styles.tab}
            onClick={() => setTab('live')}
          >
            {t('settings.debugTabLive')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'file'}
            className={tab === 'file' ? styles.tabActive : styles.tab}
            onClick={() => setTab('file')}
          >
            {t('settings.debugTabFile')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'prefs'}
            className={tab === 'prefs' ? styles.tabActive : styles.tab}
            onClick={() => setTab('prefs')}
          >
            {t('settings.debugTabPrefs')}
          </button>
        </div>
      </header>

      {tab !== 'prefs' ? (
        <div className={styles.toolbar}>
          {tab === 'live' ? (
            <div className={styles.filters}>
              <select
                className={styles.select}
                value={scope}
                aria-label={t('settings.debugScope')}
                onChange={(e) => setScope(e.target.value as (typeof SCOPES)[number])}
              >
                {SCOPES.map((s) => (
                  <option key={s} value={s}>
                    {t(scopeLabelKey(s))}
                  </option>
                ))}
              </select>
              <select
                className={styles.select}
                value={viewLevel}
                aria-label={t('settings.debugLevel')}
                onChange={(e) => setViewLevel(e.target.value as (typeof VIEW_LEVELS)[number])}
              >
                {VIEW_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {t(viewLevelLabelKey(l))}
                  </option>
                ))}
              </select>
              <select
                className={styles.select}
                value={timeRange}
                aria-label={t('settings.debugTimeRange')}
                onChange={(e) => setTimeRange(e.target.value as TimeRange)}
              >
                {TIME_RANGES.map((r) => (
                  <option key={r} value={r}>
                    {t(timeRangeLabelKey(r))}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <p className={styles.fileMeta}>{t('settings.debugFileMeta')}</p>
          )}

          <div className={styles.actions}>
            <button type="button" className={styles.ghostBtn} onClick={() => void onCopy()}>
              {t('settings.debugCopy')}
            </button>
            {tab === 'live' ? (
              <button type="button" className={styles.ghostBtn} onClick={() => void onClear()}>
                {t('settings.debugClear')}
              </button>
            ) : (
              <button type="button" className={styles.ghostBtn} onClick={() => void loadTail()}>
                {t('settings.debugRefresh')}
              </button>
            )}
          </div>
        </div>
      ) : null}

      {hint ? <p className={styles.toast}>{hint}</p> : null}

      {tab === 'live' ? (
        <div className={styles.log} role="log" aria-live="polite">
          {filtered.length === 0 ? (
            <p className={styles.empty}>{t('settings.debugEmpty')}</p>
          ) : (
            filtered.map((e) => (
              <div
                key={e.id}
                className={`${styles.row} ${
                  e.level === 'error' ? styles.rowError : e.level === 'warn' ? styles.rowWarn : ''
                }`}
              >
                <span className={styles.time}>{formatTime(e.ts, showDate)}</span>
                <span
                  className={`${styles.level} ${
                    e.level === 'error'
                      ? styles.levelError
                      : e.level === 'warn'
                        ? styles.levelWarn
                        : styles.levelInfo
                  }`}
                >
                  {e.level}
                </span>
                <span className={styles.scope}>{e.scope}</span>
                <div className={styles.msg}>
                  <span>{e.message}</span>
                  {e.detail ? <span className={styles.detail}>{e.detail}</span> : null}
                </div>
              </div>
            ))
          )}
        </div>
      ) : null}

      {tab === 'file' ? (
        <pre className={styles.tail}>{mainTail || t('settings.debugEmpty')}</pre>
      ) : null}

      {tab === 'prefs' ? (
        <div className={styles.prefs}>
          <p className={styles.prefsHint}>{t('settings.debugWriteHint')}</p>
          <div className={styles.prefsGrid}>
            <label className={styles.pref}>
              <span>{t('settings.debugWriteLevel')}</span>
              <select
                className={styles.select}
                value={logSettings.writeLevel}
                disabled={saving}
                onChange={(e) => void saveSettings({ writeLevel: e.target.value as DebugWriteLevel })}
              >
                {WRITE_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {t(writeLevelLabelKey(l))}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.pref}>
              <span>{t('settings.debugRetention')}</span>
              <select
                className={styles.select}
                value={logSettings.retentionDays}
                disabled={saving}
                onChange={(e) => void saveSettings({ retentionDays: Number(e.target.value) })}
              >
                {RETENTION_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {t('settings.debugRetentionDays', { days: d })}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.pref}>
              <span>{t('settings.debugMaxFileSize')}</span>
              <select
                className={styles.select}
                value={logSettings.maxFileSizeMb}
                disabled={saving}
                onChange={(e) => void saveSettings({ maxFileSizeMb: Number(e.target.value) })}
              >
                {[1, 2, 5, 10, 20, 50].map((mb) => (
                  <option key={mb} value={mb}>
                    {t('settings.debugMaxFileSizeMb', { mb })}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.pref}>
              <span>{t('settings.debugMaxActivity')}</span>
              <select
                className={styles.select}
                value={logSettings.maxActivityEntries}
                disabled={saving}
                onChange={(e) => void saveSettings({ maxActivityEntries: Number(e.target.value) })}
              >
                {ACTIVITY_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {t('settings.debugMaxActivityCount', { count: n })}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      ) : null}

      {tab !== 'prefs' && mainLogPath ? (
        <footer className={styles.footer}>
          <button
            type="button"
            className={styles.pathBtn}
            onClick={() => void onOpenLog()}
            title={mainLogPath}
          >
            {t('settings.debugRevealFile')}
          </button>
        </footer>
      ) : null}
    </div>
  )
}

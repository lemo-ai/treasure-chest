import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ActivityLogEntry, ActivityLogLevel } from '@shared'
import styles from '../pages/SettingsPage.module.css'

const SCOPES = ['all', 'image', 'image.smart', 'image.install', 'app', 'debug'] as const
const LEVELS: Array<'all' | ActivityLogLevel> = ['all', 'info', 'warn', 'error']

function scopeLabelKey(scope: (typeof SCOPES)[number]): string {
  if (scope === 'all') return 'settings.debugScopeAll'
  if (scope === 'image') return 'settings.debugScope.image'
  if (scope === 'image.smart') return 'settings.debugScope.imageSmart'
  if (scope === 'image.install') return 'settings.debugScope.imageInstall'
  if (scope === 'app') return 'settings.debugScope.app'
  return 'settings.debugScope.debug'
}

function levelLabelKey(level: (typeof LEVELS)[number]): string {
  if (level === 'all') return 'settings.debugLevelAll'
  if (level === 'info') return 'settings.debugLevel.info'
  if (level === 'warn') return 'settings.debugLevel.warn'
  return 'settings.debugLevel.error'
}

function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString(undefined, {
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
  const [entries, setEntries] = useState<ActivityLogEntry[]>([])
  const [mainLogPath, setMainLogPath] = useState('')
  const [mainTail, setMainTail] = useState('')
  const [scope, setScope] = useState<(typeof SCOPES)[number]>('all')
  const [level, setLevel] = useState<(typeof LEVELS)[number]>('all')
  const [showFileTail, setShowFileTail] = useState(false)
  const [hint, setHint] = useState('')

  const refresh = useCallback(async () => {
    const snap = await window.treasureChest.getDebugActivity({
      scope: scope === 'all' ? undefined : scope,
      level: level === 'all' ? undefined : level,
      limit: 400,
    })
    setEntries(snap.entries)
    setMainLogPath(snap.mainLogPath)
  }, [scope, level])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    return window.treasureChest.onDebugActivityAppended(() => {
      void refresh()
    })
  }, [refresh])

  const filtered = useMemo(() => [...entries].reverse(), [entries])

  const onClear = async (): Promise<void> => {
    await window.treasureChest.clearDebugActivity()
    setHint(t('settings.debugCleared'))
    await refresh()
  }

  const onCopy = async (): Promise<void> => {
    const text = filtered
      .map(
        (e) =>
          `${new Date(e.ts).toISOString()} [${e.level}] [${e.scope}] ${e.message}${
            e.detail ? ` | ${e.detail}` : ''
          }`,
      )
      .join('\n')
    await navigator.clipboard.writeText(text)
    setHint(t('settings.debugCopied'))
  }

  const onOpenLog = async (): Promise<void> => {
    const path = await window.treasureChest.openDebugMainLog()
    setHint(t('settings.debugOpenedLog', { path }))
  }

  const onLoadTail = async (): Promise<void> => {
    const text = await window.treasureChest.readDebugMainLogTail()
    setMainTail(text)
    setShowFileTail(true)
  }

  return (
    <>
      <h2 className={styles.label}>{t('settings.debugTitle')}</h2>
      <p className={styles.desc}>{t('settings.debugHint')}</p>

      <div className={styles.debugFilters}>
        <label className={styles.debugFilter}>
          <span>{t('settings.debugScope')}</span>
          <select
            className={styles.aiInput}
            value={scope}
            onChange={(e) => setScope(e.target.value as (typeof SCOPES)[number])}
          >
            {SCOPES.map((s) => (
              <option key={s} value={s}>
                {t(scopeLabelKey(s))}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.debugFilter}>
          <span>{t('settings.debugLevel')}</span>
          <select
            className={styles.aiInput}
            value={level}
            onChange={(e) => setLevel(e.target.value as (typeof LEVELS)[number])}
          >
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {t(levelLabelKey(l))}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className={styles.actionRow}>
        <button type="button" className={styles.localPresetBtn} onClick={() => void refresh()}>
          {t('settings.debugRefresh')}
        </button>
        <button type="button" className={styles.localPresetBtn} onClick={() => void onCopy()}>
          {t('settings.debugCopy')}
        </button>
        <button type="button" className={styles.localPresetBtn} onClick={() => void onClear()}>
          {t('settings.debugClear')}
        </button>
        <button type="button" className={styles.localPresetBtn} onClick={() => void onOpenLog()}>
          {t('settings.debugOpenFile')}
        </button>
        <button type="button" className={styles.localPresetBtn} onClick={() => void onLoadTail()}>
          {t('settings.debugShowFileTail')}
        </button>
      </div>

      {mainLogPath ? (
        <p className={styles.settingHint}>
          {t('settings.debugLogPath')}: <code className={styles.debugPath}>{mainLogPath}</code>
        </p>
      ) : null}
      {hint ? <p className={styles.hint}>{hint}</p> : null}

      <div className={styles.debugLog} role="log" aria-live="polite">
        {filtered.length === 0 ? (
          <p className={styles.settingHint}>{t('settings.debugEmpty')}</p>
        ) : (
          filtered.map((e) => (
            <div
              key={e.id}
              className={`${styles.debugRow} ${
                e.level === 'error'
                  ? styles.debugRowError
                  : e.level === 'warn'
                    ? styles.debugRowWarn
                    : ''
              }`}
            >
              <span className={styles.debugTime}>{formatTime(e.ts)}</span>
              <span className={styles.debugLevel}>{e.level}</span>
              <span className={styles.debugScope}>{e.scope}</span>
              <span className={styles.debugMsg}>
                {e.message}
                {e.detail ? <span className={styles.debugDetail}>{e.detail}</span> : null}
              </span>
            </div>
          ))
        )}
      </div>

      {showFileTail ? (
        <>
          <h3 className={styles.imageSubhead}>{t('settings.debugFileTail')}</h3>
          <pre className={styles.debugTail}>{mainTail || t('settings.debugEmpty')}</pre>
        </>
      ) : null}
    </>
  )
}

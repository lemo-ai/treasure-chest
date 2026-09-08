import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  VISION_MODEL_CATALOG,
  visionCatalogForTask,
  type ImageSmartTask,
  type ImageToolsSettings,
  type VisionInstallProgress,
  type VisionModelState,
  type VisionRuntimeKind,
} from '@shared'
import styles from '../pages/SettingsPage.module.css'

const TASKS: ImageSmartTask[] = [
  'remove_background',
  'background_replace',
  'remove_watermark',
  'upscale',
  'denoise',
]

export function ImageEnginesPanel(): React.JSX.Element {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<ImageToolsSettings | null>(null)
  const [busyIds, setBusyIds] = useState<Record<string, true>>({})
  const [progressById, setProgressById] = useState<Record<string, VisionInstallProgress>>({})
  const [menuId, setMenuId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)

  const refresh = useCallback(async () => {
    setSettings(await window.treasureChest.getImageToolsSettings())
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    return window.treasureChest.onImageVisionInstallProgress((payload) => {
      setProgressById((prev) => {
        const cur = prev[payload.id]
        if (
          cur &&
          cur.percent === payload.percent &&
          cur.phase === payload.phase &&
          cur.fileName === payload.fileName
        ) {
          return prev
        }
        return { ...prev, [payload.id]: payload }
      })
      if (payload.phase === 'error') setError(payload.error || t('tools.errors.generic'))
    })
  }, [t])

  useEffect(() => {
    if (!menuId) return
    const onDoc = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuId(null)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuId])

  const stateOf = (id: string): VisionModelState | undefined =>
    settings?.models.find((m) => m.id === id)

  const patchSettings = async (partial: Partial<ImageToolsSettings>): Promise<void> => {
    setError('')
    try {
      setSettings(await window.treasureChest.setImageToolsSettings(partial))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('tools.errors.generic'))
    }
  }

  const beginBusy = (id: string): void => {
    setBusyIds((prev) => ({ ...prev, [id]: true }))
  }

  const endBusy = (id: string): void => {
    setBusyIds((prev) => {
      if (!prev[id]) return prev
      const next = { ...prev }
      delete next[id]
      return next
    })
    setProgressById((prev) => {
      if (!prev[id]) return prev
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  const onDownload = async (id: string): Promise<void> => {
    setMenuId(null)
    beginBusy(id)
    setError('')
    setProgressById((prev) => ({
      ...prev,
      [id]: { id, received: 0, total: 0, percent: 0, phase: 'start' },
    }))
    try {
      await window.treasureChest.installImageVisionModel(id)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('tools.errors.generic'))
    } finally {
      endBusy(id)
    }
  }

  const onLocalFile = async (id: string): Promise<void> => {
    setMenuId(null)
    beginBusy(id)
    setError('')
    try {
      await window.treasureChest.importImageVisionModel(id)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('tools.errors.generic'))
    } finally {
      endBusy(id)
    }
  }

  const onUninstall = async (id: string): Promise<void> => {
    setMenuId(null)
    beginBusy(id)
    setError('')
    try {
      await window.treasureChest.uninstallImageVisionModel(id)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('tools.errors.generic'))
    } finally {
      endBusy(id)
    }
  }

  const runtimeLabel = (runtime: VisionRuntimeKind): string => {
    if (runtime === 'adapted') return t('settings.imageRuntime.adapted')
    if (runtime === 'canvas_fallback') return t('settings.imageRuntime.canvas')
    return t('settings.imageRuntime.pending')
  }

  const runtimeClass = (runtime: VisionRuntimeKind): string => {
    if (runtime === 'adapted') return styles.imageRuntimeAdapted
    if (runtime === 'canvas_fallback') return styles.imageRuntimeCanvas
    return styles.imageRuntimePending
  }

  return (
    <>
      <h2 className={styles.label}>{t('settings.imageEnginesTitle')}</h2>
      <p className={styles.desc}>{t('settings.imageEnginesHint')}</p>
      <p className={styles.settingHint}>{t('settings.imageEnginesCloudHint')}</p>

      <div className={styles.settingRow}>
        <div>
          <div className={styles.settingTitle}>{t('settings.imagePreferLocal')}</div>
          <p className={styles.settingHint}>{t('settings.imagePreferLocalHint')}</p>
        </div>
        <input
          type="checkbox"
          checked={settings?.preferLocalVision ?? true}
          onChange={(e) => {
            void patchSettings({ preferLocalVision: e.target.checked })
          }}
        />
      </div>

      <h3 className={styles.imageSubhead}>{t('settings.imageTaskDefaults')}</h3>
      <p className={styles.settingHint}>{t('settings.imageTaskDefaultsHint')}</p>
      <div className={styles.imageTaskGrid}>
        {TASKS.map((task) => {
          const options = visionCatalogForTask(task)
          const value = settings?.taskModelIds[task] ?? options[0]?.id ?? ''
          return (
            <label key={task} className={styles.imageTaskField}>
              <span className={styles.settingTitle}>{t(`tools.image.task.${task}`)}</span>
              <select
                className={styles.aiInput}
                value={value}
                onChange={(e) =>
                  void patchSettings({ taskModelIds: { [task]: e.target.value } })
                }
              >
                {options.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {t(`tools.image.models.${opt.nameKey}`)}
                    {opt.runtime === 'import_pending'
                      ? ` (${t('settings.imageRuntime.pending')})`
                      : ''}
                  </option>
                ))}
              </select>
            </label>
          )
        })}
      </div>

      <h3 className={styles.imageSubhead}>{t('settings.imageLocalCatalog')}</h3>
      <p className={styles.settingHint}>{t('settings.imageOneClickHint')}</p>
      <div className={styles.aiModelList}>
        {VISION_MODEL_CATALOG.map((entry) => {
          const state = stateOf(entry.id)
          const ready = state?.status === 'ready' && !busyIds[entry.id]
          const installing = Boolean(busyIds[entry.id]) || state?.status === 'installing'
          const progress = progressById[entry.id]
          const showProgress = installing && Boolean(progress)
          const open = menuId === entry.id
          return (
            <div key={entry.id} className={styles.aiModelRow}>
              <div className={styles.aiModelPickBtn} style={{ cursor: 'default' }}>
                <div className={styles.aiModelId}>{t(`tools.image.models.${entry.nameKey}`)}</div>
                <div className={styles.aiModelCaps}>
                  <span className={styles.aiModelCap}>{t(`tools.image.task.${entry.task}`)}</span>
                  <span className={`${styles.aiModelCap} ${runtimeClass(entry.runtime)}`}>
                    {runtimeLabel(entry.runtime)}
                  </span>
                  <span className={styles.aiModelCap}>
                    {ready
                      ? t('settings.imageModelReady')
                      : state?.status === 'error' && !installing
                        ? t('settings.imageModelError')
                        : installing
                          ? t('settings.imageInstalling')
                          : t('settings.imageModelMissing')}
                  </span>
                  {entry.sizeHintMb ? (
                    <span className={styles.aiModelCap}>~{entry.sizeHintMb}MB</span>
                  ) : null}
                </div>
                <p className={styles.settingHint}>{t(`tools.image.models.${entry.descKey}`)}</p>
                {ready && state?.path ? (
                  <p className={styles.imageModelPath}>{state.path}</p>
                ) : null}
                <div
                  className={styles.imageProgress}
                  style={{ visibility: showProgress ? 'visible' : 'hidden' }}
                  aria-hidden={!showProgress}
                >
                  <div className={styles.imageProgressTrack}>
                    <div
                      className={styles.imageProgressBar}
                      style={{ width: `${Math.max(4, progress?.percent ?? 0)}%` }}
                    />
                  </div>
                  <span className={styles.imageProgressLabel}>
                    {progress
                      ? [
                          progress.fileCount && progress.fileIndex
                            ? `${progress.fileIndex}/${progress.fileCount}`
                            : null,
                          progress.fileName || null,
                          `${progress.percent}%`,
                        ]
                          .filter(Boolean)
                          .join(' · ')
                      : t('settings.imageInstalling')}
                  </span>
                </div>
                {state?.error && !installing ? <p className={styles.mcpError}>{state.error}</p> : null}
              </div>
              <div className={styles.aiActionRow}>
                <div className={styles.imageInstallWrap} ref={open ? menuRef : undefined}>
                  <button
                    type="button"
                    className={styles.aiAddBtn}
                    disabled={installing}
                    onClick={() => setMenuId((cur) => (cur === entry.id ? null : entry.id))}
                    aria-expanded={open}
                  >
                    {installing
                      ? t('settings.imageInstalling')
                      : ready
                        ? t('settings.imageReinstall')
                        : t('settings.imageInstall')}
                  </button>
                  {open ? (
                    <div className={styles.imageInstallMenu} role="menu">
                      <button
                        type="button"
                        role="menuitem"
                        className={styles.imageInstallMenuItem}
                        onClick={() => void onDownload(entry.id)}
                      >
                        <span className={styles.imageInstallMenuTitle}>
                          {t('settings.imageInstallOnline')}
                        </span>
                        <span className={styles.imageInstallMenuHint}>
                          {t('settings.imageInstallOnlineHint')}
                        </span>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className={styles.imageInstallMenuItem}
                        onClick={() => void onLocalFile(entry.id)}
                      >
                        <span className={styles.imageInstallMenuTitle}>
                          {t('settings.imageInstallLocal')}
                        </span>
                        <span className={styles.imageInstallMenuHint}>
                          {t('settings.imageInstallLocalHint')}
                        </span>
                      </button>
                    </div>
                  ) : null}
                </div>
                {ready ? (
                  <button
                    type="button"
                    className={styles.aiModelRemoveBtn}
                    disabled={installing}
                    onClick={() => void onUninstall(entry.id)}
                  >
                    {t('settings.imageUninstall')}
                  </button>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>

      {error ? <p className={styles.mcpError}>{error}</p> : null}
    </>
  )
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  VISION_MODEL_CATALOG,
  visionCatalogForTask,
  type CustomVisionEngine,
  type CustomVisionEngineKind,
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

type CustomDraft = {
  id?: string
  name: string
  task: ImageSmartTask
  kind: CustomVisionEngineKind
  enabled: boolean
  onnxSourcePath: string
  endpointUrl: string
  apiKey: string
  notes: string
}

function emptyDraft(): CustomDraft {
  return {
    name: '',
    task: 'remove_background',
    kind: 'onnx',
    enabled: true,
    onnxSourcePath: '',
    endpointUrl: '',
    apiKey: '',
    notes: '',
  }
}

function draftFromEngine(engine: CustomVisionEngine): CustomDraft {
  return {
    id: engine.id,
    name: engine.name,
    task: engine.task,
    kind: engine.kind,
    enabled: engine.enabled,
    onnxSourcePath: '',
    endpointUrl: engine.endpointUrl ?? '',
    apiKey: engine.apiKey ?? '',
    notes: engine.notes ?? '',
  }
}

export function ImageEnginesPanel(): React.JSX.Element {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<ImageToolsSettings | null>(null)
  const [busyIds, setBusyIds] = useState<Record<string, true>>({})
  const [progressById, setProgressById] = useState<Record<string, VisionInstallProgress>>({})
  const [menuId, setMenuId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState<CustomDraft | null>(null)
  const [savingCustom, setSavingCustom] = useState(false)
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

  const customForTask = (task: ImageSmartTask): CustomVisionEngine[] =>
    (settings?.customEngines ?? []).filter(
      (e) =>
        e.enabled &&
        (e.task === task || (task === 'background_replace' && e.task === 'remove_background')),
    )

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

  const saveCustom = async (): Promise<void> => {
    if (!draft) return
    setSavingCustom(true)
    setError('')
    try {
      const next = await window.treasureChest.upsertCustomVisionEngine({
        id: draft.id,
        name: draft.name,
        task: draft.task,
        kind: draft.kind,
        enabled: draft.enabled,
        onnxSourcePath: draft.kind === 'onnx' ? draft.onnxSourcePath || undefined : undefined,
        endpointUrl: draft.kind === 'http' ? draft.endpointUrl : undefined,
        apiKey: draft.kind === 'http' ? draft.apiKey || undefined : undefined,
        notes: draft.notes || undefined,
      })
      setSettings(next)
      setDraft(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('tools.errors.generic'))
    } finally {
      setSavingCustom(false)
    }
  }

  const removeCustom = async (id: string): Promise<void> => {
    setError('')
    try {
      setSettings(await window.treasureChest.removeCustomVisionEngine(id))
      if (draft?.id === id) setDraft(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('tools.errors.generic'))
    }
  }

  const pickOnnx = async (): Promise<void> => {
    const path = await window.treasureChest.pickCustomVisionOnnx()
    if (path) setDraft((d) => (d ? { ...d, onnxSourcePath: path } : d))
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

      <h3 className={styles.imageSubhead}>{t('settings.imageModelsRootTitle')}</h3>
      <p className={styles.settingHint}>{t('settings.imageModelsRootSummary')}</p>
      {settings?.resolvedModelsRoot ? (
        <p className={styles.imageModelPath}>{settings.resolvedModelsRoot}</p>
      ) : null}
      <div className={styles.actionRow}>
        <button
          type="button"
          className={styles.aiAddBtn}
          onClick={() => void window.treasureChest.openImageVisionModelsDir()}
        >
          {t('settings.imageOpenDir')}
        </button>
      </div>
      <details className={styles.imageAdvanced}>
        <summary className={styles.imageAdvancedSummary}>
          {t('settings.imageModelsRootAdvanced')}
        </summary>
        <p className={styles.settingHint}>{t('settings.imageModelsRootHint')}</p>
        <div className={styles.imageTaskGrid}>
          {(
            [
              ['userData', t('settings.imageModelsRootUserData')],
              ['custom', t('settings.imageModelsRootCustom')],
            ] as const
          ).map(([mode, label]) => (
            <label key={mode} className={styles.imageTaskField}>
              <span className={styles.settingTitle}>{label}</span>
              <input
                type="radio"
                name="visionModelsRoot"
                checked={(settings?.modelsRootMode ?? 'userData') === mode}
                onChange={() => void patchSettings({ modelsRootMode: mode })}
              />
            </label>
          ))}
        </div>
        <div className={styles.actionRow}>
          <button
            type="button"
            className={styles.aiAddBtn}
            disabled={(settings?.modelsRootMode ?? 'userData') !== 'custom'}
            onClick={() =>
              void window.treasureChest.pickImageVisionModelsRoot().then(() => refresh())
            }
          >
            {t('settings.imageModelsRootBrowse')}
          </button>
        </div>
      </details>

      <h3 className={styles.imageSubhead}>{t('settings.imageTaskDefaults')}</h3>
      <p className={styles.settingHint}>{t('settings.imageTaskDefaultsHint')}</p>
      <div className={styles.imageTaskGrid}>
        {TASKS.map((task) => {
          const options = visionCatalogForTask(task)
          const customs = customForTask(task)
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
                {customs.map((eng) => (
                  <option key={eng.id} value={eng.id}>
                    {eng.name} ({t('settings.imageCustomBadge')})
                  </option>
                ))}
              </select>
            </label>
          )
        })}
      </div>

      <h3 className={styles.imageSubhead}>{t('settings.imageCustomMarketTitle')}</h3>
      <p className={styles.settingHint}>{t('settings.imageCustomMarketHint')}</p>
      <div className={styles.actionRow}>
        <button type="button" className={styles.aiAddBtn} onClick={() => setDraft(emptyDraft())}>
          {t('settings.imageCustomAdd')}
        </button>
      </div>
      <div className={styles.aiModelList}>
        {(settings?.customEngines ?? []).map((engine) => (
          <div key={engine.id} className={styles.aiModelRow}>
            <div className={styles.aiModelPickBtn} style={{ cursor: 'default' }}>
              <div className={styles.aiModelId}>{engine.name}</div>
              <div className={styles.aiModelCaps}>
                <span className={styles.aiModelCap}>{t(`tools.image.task.${engine.task}`)}</span>
                <span className={styles.aiModelCap}>
                  {engine.kind === 'onnx'
                    ? t('settings.imageCustomKindOnnx')
                    : t('settings.imageCustomKindHttp')}
                </span>
                <span className={styles.aiModelCap}>
                  {engine.enabled
                    ? t('settings.imageCustomEnabled')
                    : t('settings.imageCustomDisabled')}
                </span>
              </div>
              {engine.kind === 'onnx' && engine.onnxPath ? (
                <p className={styles.imageModelPath}>{engine.onnxPath}</p>
              ) : null}
              {engine.kind === 'http' && engine.endpointUrl ? (
                <p className={styles.imageModelPath}>{engine.endpointUrl}</p>
              ) : null}
              {engine.notes ? <p className={styles.settingHint}>{engine.notes}</p> : null}
            </div>
            <div className={styles.aiActionRow}>
              <button
                type="button"
                className={styles.aiAddBtn}
                onClick={() => setDraft(draftFromEngine(engine))}
              >
                {t('settings.imageCustomEdit')}
              </button>
              <button
                type="button"
                className={styles.aiModelRemoveBtn}
                onClick={() => void removeCustom(engine.id)}
              >
                {t('settings.imageCustomRemove')}
              </button>
            </div>
          </div>
        ))}
      </div>

      {draft ? (
        <div className={styles.aiModelList} style={{ marginTop: 12 }}>
          <div className={styles.aiModelRow}>
            <div className={styles.aiModelPickBtn} style={{ cursor: 'default', width: '100%' }}>
              <div className={styles.aiModelId}>
                {draft.id
                  ? t('settings.imageCustomEditTitle')
                  : t('settings.imageCustomAddTitle')}
              </div>
              <label className={styles.imageTaskField}>
                <span className={styles.settingTitle}>{t('settings.imageCustomName')}</span>
                <input
                  className={styles.aiInput}
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </label>
              <label className={styles.imageTaskField}>
                <span className={styles.settingTitle}>{t('settings.imageCustomTask')}</span>
                <select
                  className={styles.aiInput}
                  value={draft.task}
                  onChange={(e) =>
                    setDraft({ ...draft, task: e.target.value as ImageSmartTask })
                  }
                >
                  {TASKS.map((task) => (
                    <option key={task} value={task}>
                      {t(`tools.image.task.${task}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.imageTaskField}>
                <span className={styles.settingTitle}>{t('settings.imageCustomKind')}</span>
                <select
                  className={styles.aiInput}
                  value={draft.kind}
                  onChange={(e) =>
                    setDraft({ ...draft, kind: e.target.value as CustomVisionEngineKind })
                  }
                >
                  <option value="onnx">{t('settings.imageCustomKindOnnx')}</option>
                  <option value="http">{t('settings.imageCustomKindHttp')}</option>
                </select>
              </label>
              {draft.kind === 'onnx' ? (
                <div className={styles.actionRow}>
                  <button type="button" className={styles.aiAddBtn} onClick={() => void pickOnnx()}>
                    {t('settings.imageCustomPickOnnx')}
                  </button>
                  <span className={styles.settingHint}>
                    {draft.onnxSourcePath ||
                      (draft.id
                        ? t('settings.imageCustomKeepOnnx')
                        : t('settings.imageCustomOnnxHint'))}
                  </span>
                </div>
              ) : (
                <>
                  <label className={styles.imageTaskField}>
                    <span className={styles.settingTitle}>{t('settings.imageCustomEndpoint')}</span>
                    <input
                      className={styles.aiInput}
                      value={draft.endpointUrl}
                      placeholder="https://…"
                      onChange={(e) => setDraft({ ...draft, endpointUrl: e.target.value })}
                    />
                  </label>
                  <label className={styles.imageTaskField}>
                    <span className={styles.settingTitle}>{t('settings.imageCustomApiKey')}</span>
                    <input
                      className={styles.aiInput}
                      value={draft.apiKey}
                      onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
                    />
                  </label>
                </>
              )}
              <label className={styles.imageTaskField}>
                <span className={styles.settingTitle}>{t('settings.imageCustomNotes')}</span>
                <input
                  className={styles.aiInput}
                  value={draft.notes}
                  onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                />
              </label>
              <label className={styles.settingRow}>
                <span className={styles.settingTitle}>{t('settings.imageCustomEnabled')}</span>
                <input
                  type="checkbox"
                  checked={draft.enabled}
                  onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
                />
              </label>
              <div className={styles.actionRow}>
                <button
                  type="button"
                  className={styles.aiAddBtn}
                  disabled={savingCustom || !draft.name.trim()}
                  onClick={() => void saveCustom()}
                >
                  {savingCustom ? t('settings.imageInstalling') : t('settings.imageCustomSave')}
                </button>
                <button
                  type="button"
                  className={styles.aiModelRemoveBtn}
                  disabled={savingCustom}
                  onClick={() => setDraft(null)}
                >
                  {t('settings.imageCustomCancel')}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

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

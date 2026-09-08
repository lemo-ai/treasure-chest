import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import {
  VISION_MODEL_CATALOG,
  firstOutputModelId,
  visionCatalogEntry,
  type ImageSmartTask,
  type ImageToolsSettings,
  type VisionModelState,
} from '@shared'
import { ColorField } from '../components/ColorField'
import { ToolShell } from '../components/ToolShell'
import { IconRedo, IconUndo } from '@renderer/shared/ui/icons'
import {
  DEFAULT_ADJUST,
  addBorder,
  addTextOverlay,
  applyAdjust,
  applyFilter,
  autoEnhance,
  compressImage,
  cropByRatio,
  dataUrlFromFile,
  flipImage,
  getImageSize,
  resizeImage,
  rotateImage,
  roundCorners,
  type AdjustValues,
  type CropRatioId,
  type FilterId,
  type TextPosition,
} from '../lib/canvasOps'
import { runSmartInRenderer } from '../lib/smartRunner'
import styles from './ImageToolkitPage.module.css'

type TabId = 'classic' | 'smart' | 'generate'
type ClassicTool = 'adjust' | 'transform' | 'filter' | 'text' | 'export'

const FILTERS: FilterId[] = [
  'none',
  'grayscale',
  'sepia',
  'cool',
  'warm',
  'invert',
  'vintage',
  'fade',
  'soft',
  'vignette',
  'sharpen',
]
const CROP_RATIOS: CropRatioId[] = ['1:1', '4:3', '3:2', '16:9', '9:16']
const TEXT_POSITIONS: TextPosition[] = [
  'center',
  'top',
  'bottom',
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
]
const SMART_TASKS: ImageSmartTask[] = [
  'remove_background',
  'background_replace',
  'upscale',
  'denoise',
  'remove_watermark',
]
const CLASSIC_TOOLS: ClassicTool[] = ['adjust', 'transform', 'filter', 'text', 'export']
const HISTORY_LIMIT = 40

function classicToolLabelKey(tool: ClassicTool): string {
  if (tool === 'export') return 'compress'
  if (tool === 'text') return 'text'
  return tool
}

export function ImageToolkitPage(): React.JSX.Element {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const historyRef = useRef<{ stack: string[]; index: number }>({ stack: [], index: -1 })
  const [tab, setTab] = useState<TabId>('classic')
  const [classicTool, setClassicTool] = useState<ClassicTool>('adjust')
  const [history, setHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [errorLinkTo, setErrorLinkTo] = useState<string | null>(null)

  const current = historyIndex >= 0 ? (history[historyIndex] ?? null) : null
  const canUndo = historyIndex > 0
  const canRedo = historyIndex >= 0 && historyIndex < history.length - 1

  const [adjust, setAdjust] = useState<AdjustValues>({ ...DEFAULT_ADJUST })
  const [filter, setFilter] = useState<FilterId>('none')
  const [quality, setQuality] = useState(0.85)
  const [format, setFormat] = useState<'image/jpeg' | 'image/webp' | 'image/png'>('image/jpeg')
  const [maxEdge, setMaxEdge] = useState(2048)
  const [rotateDeg, setRotateDeg] = useState(0)
  const [cropRatio, setCropRatio] = useState<CropRatioId>('1:1')
  const [resizeW, setResizeW] = useState(0)
  const [resizeH, setResizeH] = useState(0)
  const [lockAspect, setLockAspect] = useState(true)
  const [aspect, setAspect] = useState(1)
  const [textContent, setTextContent] = useState('')
  const [textPosition, setTextPosition] = useState<TextPosition>('bottom-right')
  const [textSize, setTextSize] = useState(6)
  const [textColor, setTextColor] = useState('#ffffff')
  const [textOpacity, setTextOpacity] = useState(0.9)
  const [borderWidth, setBorderWidth] = useState(24)
  const [borderColor, setBorderColor] = useState('#ffffff')
  const [cornerRadius, setCornerRadius] = useState(8)
  const [smartTask, setSmartTask] = useState<ImageSmartTask>('remove_background')
  const [scale, setScale] = useState<2 | 3 | 4>(2)
  const [fillColor, setFillColor] = useState('#ffffff')
  const [prompt, setPrompt] = useState('')
  const [genSize, setGenSize] = useState('1024x1024')
  const [imageSettings, setImageSettings] = useState<ImageToolsSettings | null>(null)
  const [imageModels, setImageModels] = useState<string[]>([])

  const syncHistory = (stack: string[], index: number): void => {
    historyRef.current = { stack, index }
    setHistory(stack)
    setHistoryIndex(index)
  }

  const replaceImage = (dataUrl: string): void => {
    syncHistory([dataUrl], 0)
    setError('')
    setErrorLinkTo(null)
    setMessage('')
    void getImageSize(dataUrl).then((size) => {
      setResizeW(size.width)
      setResizeH(size.height)
      setAspect(size.width / Math.max(1, size.height))
    })
  }

  const commitImage = (dataUrl: string): void => {
    const { stack, index } = historyRef.current
    const next = [...stack.slice(0, index + 1), dataUrl].slice(-HISTORY_LIMIT)
    syncHistory(next, next.length - 1)
    setError('')
  }

  const undo = useCallback((): void => {
    const { stack, index } = historyRef.current
    if (index <= 0) return
    syncHistory(stack, index - 1)
    setMessage(t('tools.image.undone'))
  }, [t])

  const redo = useCallback((): void => {
    const { stack, index } = historyRef.current
    if (index < 0 || index >= stack.length - 1) return
    syncHistory(stack, index + 1)
    setMessage(t('tools.image.redone'))
  }, [t])

  const resetToOriginal = (): void => {
    const { stack } = historyRef.current
    if (!stack[0]) return
    syncHistory([stack[0]], 0)
    setMessage(t('tools.image.resetDone'))
  }

  const refreshSettings = useCallback(async () => {
    const snap = await window.treasureChest.getImageToolsSettings()
    setImageSettings(snap)
    const fortune = (await window.treasureChest.getSettingsSnapshot()).fortune
    const active = fortune.aiProviders.find((p) => p.id === fortune.aiActiveProviderId)
    const ids =
      active?.models.filter((m) => m.outputModalities.includes('image')).map((m) => m.id) ?? []
    if (ids.length === 0 && active) {
      const legacy = firstOutputModelId(active.models, 'image')
      setImageModels(legacy ? [legacy] : [])
    } else {
      setImageModels(ids)
    }
  }, [])

  useEffect(() => {
    void refreshSettings()
  }, [refreshSettings])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const meta = e.metaKey || e.ctrlKey
      if (!meta) return
      const key = e.key.toLowerCase()
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if (key === 'z' && e.shiftKey) {
        e.preventDefault()
        redo()
      } else if (key === 'y') {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  const modelReady = useMemo(() => {
    const map = new Map((imageSettings?.models ?? []).map((m) => [m.id, m]))
    const out: Record<string, VisionModelState | undefined> = {}
    for (const entry of VISION_MODEL_CATALOG) out[entry.id] = map.get(entry.id)
    return out
  }, [imageSettings])

  const onPickFile = async (file: File | null): Promise<void> => {
    if (!file) return
    replaceImage(await dataUrlFromFile(file))
  }

  const withBusy = async (fn: () => Promise<void>): Promise<void> => {
    setBusy(true)
    setError('')
    setErrorLinkTo(null)
    setMessage('')
    try {
      await fn()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('tools.errors.generic'))
    } finally {
      setBusy(false)
    }
  }

  const requireImage = (): string => {
    if (!current) throw new Error(t('tools.image.needImage'))
    return current
  }

  const modelIdForTask = (task: ImageSmartTask): string => {
    const preferred =
      imageSettings?.taskModelIds[task] ||
      VISION_MODEL_CATALOG.find((c) => c.task === task)?.id ||
      ''
    const entry = preferred ? visionCatalogEntry(preferred) : undefined
    // Cutout only runs via adapted IMG.LY; don't gate on pending-weight models.
    if (
      (task === 'remove_background' || task === 'background_replace') &&
      entry?.runtime === 'import_pending'
    ) {
      return 'imgly-rembg'
    }
    return preferred
  }

  const runSmart = async (): Promise<void> => {
    await withBusy(async () => {
      const imageDataUrl = requireImage()
      const modelId = modelIdForTask(smartTask)
      const state = modelReady[modelId]
      if (!state || state.status !== 'ready') {
        setError(t('tools.image.modelRequired'))
        setErrorLinkTo('/settings?section=image')
        return
      }
      const result = await runSmartInRenderer({
        task: smartTask,
        imageDataUrl,
        modelId,
        scale,
        fillColor,
      })
      if (!result.ok) {
        const settingsImage = '/settings?section=image'
        if (result.reason === 'model_not_installed') {
          setError(t('tools.image.modelRequired'))
          setErrorLinkTo(settingsImage)
          return
        }
        if (result.error === 'lama_runtime_pending') {
          setError(t('tools.image.lamaPending'))
          setErrorLinkTo(settingsImage)
          return
        }
        if (result.error === 'runtime_pending') {
          setError(t('tools.image.runtimePending'))
          setErrorLinkTo(settingsImage)
          return
        }
        if (
          result.error === 'imgly_cdn_unreachable' ||
          result.error === 'imgly_local_unreachable' ||
          result.error === 'imgly_resources_missing' ||
          result.error === 'imgly_model_missing' ||
          result.error === 'onnx_not_found' ||
          /failed to fetch/i.test(result.error || '')
        ) {
          setError(
            result.error === 'imgly_local_unreachable'
              ? t('tools.image.imglyLocalFailed')
              : t('tools.image.imglyCdnFailed'),
          )
          setErrorLinkTo(settingsImage)
          return
        }
        setError(result.error || t('tools.errors.generic'))
        return
      }
      if (result.imageDataUrl) {
        commitImage(result.imageDataUrl)
        setMessage(t('tools.image.smartDone'))
      }
    })
  }

  const inspectorTitle =
    tab === 'classic'
      ? t(`tools.image.${classicToolLabelKey(classicTool)}`)
      : tab === 'smart'
        ? t('tools.image.smart')
        : t('tools.image.generate')

  return (
    <ToolShell title={t('tools.image.title')} wide compact>
      <div className={styles.modeBar}>
        <div className={styles.modes}>
          {(['classic', 'smart', 'generate'] as TabId[]).map((id) => (
            <button
              key={id}
              type="button"
              className={`${styles.mode} ${tab === id ? styles.modeActive : ''}`}
              onClick={() => setTab(id)}
            >
              {t(`tools.image.tab.${id}`)}
            </button>
          ))}
        </div>
        <div className={styles.fileActions}>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            {t('tools.image.upload')}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => void onPickFile(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            className={styles.btnGhost}
            disabled={!canUndo || busy}
            onClick={undo}
            title={`${t('tools.image.undo')} (⌘Z)`}
          >
            <span className={styles.btnIcon}>
              <IconUndo />
            </span>
            {t('tools.image.undo')}
          </button>
          <button
            type="button"
            className={styles.btnGhost}
            disabled={!canRedo || busy}
            onClick={redo}
            title={`${t('tools.image.redo')} (⌘⇧Z)`}
          >
            <span className={styles.btnIcon}>
              <IconRedo />
            </span>
            {t('tools.image.redo')}
          </button>
          <button
            type="button"
            className={styles.btnGhost}
            disabled={!current || historyIndex <= 0 || busy}
            onClick={resetToOriginal}
            title={t('tools.image.reset')}
          >
            {t('tools.image.reset')}
          </button>
          <button
            type="button"
            className={styles.btnGhost}
            disabled={!current || busy}
            onClick={() =>
              void withBusy(async () => {
                const dataUrl = requireImage()
                const res = await window.treasureChest.saveImageFile({
                  dataUrl,
                  defaultName: `edited-${Date.now()}.png`,
                })
                if (!res.ok) {
                  if (res.error !== 'cancelled') setError(res.error || t('tools.errors.generic'))
                  return
                }
                setMessage(t('tools.image.saved', { path: res.path }))
              })
            }
          >
            {t('tools.image.save')}
          </button>
        </div>
      </div>

      <div className={styles.editor}>
        {tab === 'classic' ? (
          <aside className={styles.rail} aria-label={t('tools.image.tab.classic')}>
            {CLASSIC_TOOLS.map((tool) => (
              <button
                key={tool}
                type="button"
                className={`${styles.railItem} ${classicTool === tool ? styles.railItemActive : ''}`}
                onClick={() => setClassicTool(tool)}
              >
                {t(`tools.image.${classicToolLabelKey(tool)}`)}
              </button>
            ))}
          </aside>
        ) : null}

        {tab === 'smart' ? (
          <aside className={styles.rail} aria-label={t('tools.image.smartTask')}>
            {SMART_TASKS.map((task) => {
              const mid = modelIdForTask(task)
              const ready = modelReady[mid]?.status === 'ready'
              return (
                <button
                  key={task}
                  type="button"
                  className={`${styles.railItem} ${smartTask === task ? styles.railItemActive : ''}`}
                  onClick={() => setSmartTask(task)}
                >
                  <span className={styles.railLabel}>{t(`tools.image.task.${task}`)}</span>
                  <span className={ready ? styles.dotReady : styles.dotMissing} title={ready ? t('tools.image.modelReady') : t('tools.image.modelMissing')} />
                </button>
              )
            })}
          </aside>
        ) : null}

        <section className={styles.stage}>
          <div
            className={`${styles.canvas} ${current ? styles.canvasFilled : ''}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const file = e.dataTransfer.files?.[0]
              if (file) void onPickFile(file)
            }}
          >
            {current ? (
              <img src={current} alt="" className={styles.preview} draggable={false} />
            ) : (
              <div className={styles.empty}>
                <p className={styles.emptyTitle}>{t('tools.image.dropHint')}</p>
                <button
                  type="button"
                  className={styles.btnPrimary}
                  onClick={() => inputRef.current?.click()}
                >
                  {t('tools.image.upload')}
                </button>
              </div>
            )}
            {busy ? <div className={styles.busyOverlay}>{t('tools.image.working')}</div> : null}
          </div>
          {(message || error) && (
            <div className={styles.toastRow}>
              {message ? <p className={styles.toastOk}>{message}</p> : null}
              {error ? (
                <p className={styles.toastErr}>
                  <span>{error}</span>
                  {errorLinkTo ? (
                    <>
                      {' '}
                      <Link className={styles.toastErrLink} to={errorLinkTo}>
                        {t('tools.image.openSettings')}
                      </Link>
                    </>
                  ) : null}
                </p>
              ) : null}
            </div>
          )}
        </section>

        <aside className={styles.inspector}>
          <div className={styles.inspectorHead}>
            <h2 className={styles.inspectorTitle}>{inspectorTitle}</h2>
          </div>
          <div className={styles.inspectorBody}>
            {tab === 'classic' && classicTool === 'adjust' ? (
              <>
                {(
                  [
                    ['brightness', 40, 160, '%'],
                    ['contrast', 40, 160, '%'],
                    ['saturation', 0, 200, '%'],
                    ['hue', -180, 180, '°'],
                    ['blur', 0, 12, 'px'],
                    ['sharpen', 0, 100, '%'],
                  ] as const
                ).map(([key, min, max, unit]) => (
                  <label key={key} className={styles.field}>
                    <div className={styles.fieldHead}>
                      <span>{t(`tools.image.${key}`)}</span>
                      <span className={styles.fieldValue}>
                        {adjust[key]}
                        {unit}
                      </span>
                    </div>
                    <input
                      className={styles.range}
                      type="range"
                      min={min}
                      max={max}
                      value={adjust[key]}
                      onChange={(e) =>
                        setAdjust((prev) => ({ ...prev, [key]: Number(e.target.value) }))
                      }
                    />
                  </label>
                ))}
                <div className={styles.actionGrid}>
                  <button
                    type="button"
                    className={styles.tileBtn}
                    disabled={!current || busy}
                    onClick={() => setAdjust({ ...DEFAULT_ADJUST })}
                  >
                    {t('tools.image.resetSliders')}
                  </button>
                  <button
                    type="button"
                    className={styles.tileBtn}
                    disabled={!current || busy}
                    onClick={() =>
                      void withBusy(async () => {
                        commitImage(await autoEnhance(requireImage()))
                      })
                    }
                  >
                    {t('tools.image.autoEnhance')}
                  </button>
                </div>
                <button
                  type="button"
                  className={styles.btnPrimaryBlock}
                  disabled={!current || busy}
                  onClick={() =>
                    void withBusy(async () => {
                      commitImage(await applyAdjust(requireImage(), adjust))
                    })
                  }
                >
                  {t('tools.image.applyAdjust')}
                </button>
              </>
            ) : null}

            {tab === 'classic' && classicTool === 'transform' ? (
              <>
                <div className={styles.actionGrid}>
                  <button
                    type="button"
                    className={styles.tileBtn}
                    disabled={!current || busy}
                    onClick={() =>
                      void withBusy(async () => {
                        commitImage(await rotateImage(requireImage(), -90))
                      })
                    }
                  >
                    {t('tools.image.rotateLeft')}
                  </button>
                  <button
                    type="button"
                    className={styles.tileBtn}
                    disabled={!current || busy}
                    onClick={() =>
                      void withBusy(async () => {
                        commitImage(await rotateImage(requireImage(), 90))
                      })
                    }
                  >
                    {t('tools.image.rotateRight')}
                  </button>
                  <button
                    type="button"
                    className={styles.tileBtn}
                    disabled={!current || busy}
                    onClick={() =>
                      void withBusy(async () => {
                        commitImage(await rotateImage(requireImage(), 180))
                      })
                    }
                  >
                    {t('tools.image.rotate180')}
                  </button>
                  <button
                    type="button"
                    className={styles.tileBtn}
                    disabled={!current || busy}
                    onClick={() =>
                      void withBusy(async () => {
                        commitImage(await flipImage(requireImage(), 'h'))
                      })
                    }
                  >
                    {t('tools.image.flipH')}
                  </button>
                  <button
                    type="button"
                    className={styles.tileBtn}
                    disabled={!current || busy}
                    onClick={() =>
                      void withBusy(async () => {
                        commitImage(await flipImage(requireImage(), 'v'))
                      })
                    }
                  >
                    {t('tools.image.flipV')}
                  </button>
                </div>

                <label className={styles.field}>
                  <div className={styles.fieldHead}>
                    <span>{t('tools.image.freeRotate')}</span>
                    <span className={styles.fieldValue}>{rotateDeg}°</span>
                  </div>
                  <input
                    className={styles.range}
                    type="range"
                    min={-45}
                    max={45}
                    value={rotateDeg}
                    onChange={(e) => setRotateDeg(Number(e.target.value))}
                  />
                </label>
                <button
                  type="button"
                  className={styles.btnGhostBlock}
                  disabled={!current || busy || rotateDeg === 0}
                  onClick={() =>
                    void withBusy(async () => {
                      commitImage(await rotateImage(requireImage(), rotateDeg))
                      setRotateDeg(0)
                    })
                  }
                >
                  {t('tools.image.applyRotate')}
                </button>

                <span className={styles.fieldLabel}>{t('tools.image.crop')}</span>
                <div className={styles.chipGrid}>
                  {CROP_RATIOS.map((ratio) => (
                    <button
                      key={ratio}
                      type="button"
                      className={`${styles.chip} ${cropRatio === ratio ? styles.chipActive : ''}`}
                      onClick={() => setCropRatio(ratio)}
                    >
                      {ratio}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className={styles.btnGhostBlock}
                  disabled={!current || busy}
                  onClick={() =>
                    void withBusy(async () => {
                      commitImage(await cropByRatio(requireImage(), cropRatio))
                    })
                  }
                >
                  {t('tools.image.applyCrop')}
                </button>

                <span className={styles.fieldLabel}>{t('tools.image.resize')}</span>
                <label className={styles.checkRow}>
                  <input
                    type="checkbox"
                    checked={lockAspect}
                    onChange={(e) => setLockAspect(e.target.checked)}
                  />
                  <span>{t('tools.image.lockAspect')}</span>
                </label>
                <div className={styles.dimRow}>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>{t('tools.image.width')}</span>
                    <input
                      className={styles.input}
                      type="number"
                      min={1}
                      value={resizeW || ''}
                      onChange={(e) => {
                        const w = Number(e.target.value) || 0
                        setResizeW(w)
                        if (lockAspect && aspect > 0) setResizeH(Math.max(1, Math.round(w / aspect)))
                      }}
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>{t('tools.image.height')}</span>
                    <input
                      className={styles.input}
                      type="number"
                      min={1}
                      value={resizeH || ''}
                      onChange={(e) => {
                        const h = Number(e.target.value) || 0
                        setResizeH(h)
                        if (lockAspect && aspect > 0) setResizeW(Math.max(1, Math.round(h * aspect)))
                      }}
                    />
                  </label>
                </div>
                <button
                  type="button"
                  className={styles.btnPrimaryBlock}
                  disabled={!current || busy || resizeW < 1 || resizeH < 1}
                  onClick={() =>
                    void withBusy(async () => {
                      commitImage(await resizeImage(requireImage(), resizeW, resizeH))
                      setAspect(resizeW / Math.max(1, resizeH))
                    })
                  }
                >
                  {t('tools.image.applyResize')}
                </button>
              </>
            ) : null}

            {tab === 'classic' && classicTool === 'filter' ? (
              <>
                <div className={styles.chipGrid}>
                  {FILTERS.map((f) => (
                    <button
                      key={f}
                      type="button"
                      className={`${styles.chip} ${filter === f ? styles.chipActive : ''}`}
                      onClick={() => setFilter(f)}
                    >
                      {t(`tools.image.filter.${f}`)}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className={styles.btnPrimaryBlock}
                  disabled={!current || busy}
                  onClick={() =>
                    void withBusy(async () => {
                      commitImage(await applyFilter(requireImage(), filter))
                    })
                  }
                >
                  {t('tools.image.applyFilter')}
                </button>
              </>
            ) : null}

            {tab === 'classic' && classicTool === 'text' ? (
              <>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>{t('tools.image.textContent')}</span>
                  <input
                    className={styles.input}
                    value={textContent}
                    placeholder={t('tools.image.textPlaceholder')}
                    onChange={(e) => setTextContent(e.target.value)}
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>{t('tools.image.textPosition')}</span>
                  <select
                    className={styles.select}
                    value={textPosition}
                    onChange={(e) => setTextPosition(e.target.value as TextPosition)}
                  >
                    {TEXT_POSITIONS.map((p) => (
                      <option key={p} value={p}>
                        {t(`tools.image.pos.${p}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  <div className={styles.fieldHead}>
                    <span>{t('tools.image.textSize')}</span>
                    <span className={styles.fieldValue}>{textSize}%</span>
                  </div>
                  <input
                    className={styles.range}
                    type="range"
                    min={2}
                    max={18}
                    value={textSize}
                    onChange={(e) => setTextSize(Number(e.target.value))}
                  />
                </label>
                <label className={styles.field}>
                  <div className={styles.fieldHead}>
                    <span>{t('tools.image.textOpacity')}</span>
                    <span className={styles.fieldValue}>{Math.round(textOpacity * 100)}%</span>
                  </div>
                  <input
                    className={styles.range}
                    type="range"
                    min={0.1}
                    max={1}
                    step={0.05}
                    value={textOpacity}
                    onChange={(e) => setTextOpacity(Number(e.target.value))}
                  />
                </label>
                <div className={styles.field}>
                  <span className={styles.fieldLabel}>{t('tools.image.textColor')}</span>
                  <ColorField
                    value={textColor}
                    onChange={setTextColor}
                    aria-label={t('tools.image.textColor')}
                  />
                </div>
                <button
                  type="button"
                  className={styles.btnPrimaryBlock}
                  disabled={!current || busy || !textContent.trim()}
                  onClick={() =>
                    void withBusy(async () => {
                      commitImage(
                        await addTextOverlay(requireImage(), {
                          text: textContent,
                          position: textPosition,
                          fontSize: textSize,
                          color: textColor,
                          opacity: textOpacity,
                        }),
                      )
                    })
                  }
                >
                  {t('tools.image.applyText')}
                </button>
              </>
            ) : null}

            {tab === 'classic' && classicTool === 'export' ? (
              <>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>{t('tools.image.format')}</span>
                  <select
                    className={styles.select}
                    value={format}
                    onChange={(e) => setFormat(e.target.value as typeof format)}
                  >
                    <option value="image/jpeg">JPEG</option>
                    <option value="image/webp">WebP</option>
                    <option value="image/png">PNG</option>
                  </select>
                </label>
                <label className={styles.field}>
                  <div className={styles.fieldHead}>
                    <span>{t('tools.image.quality')}</span>
                    <span className={styles.fieldValue}>{Math.round(quality * 100)}%</span>
                  </div>
                  <input
                    className={styles.range}
                    type="range"
                    min={0.4}
                    max={1}
                    step={0.01}
                    value={quality}
                    onChange={(e) => setQuality(Number(e.target.value))}
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>{t('tools.image.maxEdge')}</span>
                  <input
                    className={styles.input}
                    type="number"
                    min={256}
                    max={8192}
                    value={maxEdge}
                    onChange={(e) => setMaxEdge(Number(e.target.value) || 2048)}
                  />
                </label>
                <button
                  type="button"
                  className={styles.btnGhostBlock}
                  disabled={!current || busy}
                  onClick={() =>
                    void withBusy(async () => {
                      commitImage(await compressImage(requireImage(), format, quality, maxEdge))
                      setMessage(t('tools.image.compressDone'))
                    })
                  }
                >
                  {t('tools.image.applyCompress')}
                </button>

                <span className={styles.fieldLabel}>{t('tools.image.border')}</span>
                <label className={styles.field}>
                  <div className={styles.fieldHead}>
                    <span>{t('tools.image.borderWidth')}</span>
                    <span className={styles.fieldValue}>{borderWidth}px</span>
                  </div>
                  <input
                    className={styles.range}
                    type="range"
                    min={0}
                    max={80}
                    value={borderWidth}
                    onChange={(e) => setBorderWidth(Number(e.target.value))}
                  />
                </label>
                <div className={styles.field}>
                  <span className={styles.fieldLabel}>{t('tools.image.borderColor')}</span>
                  <ColorField
                    value={borderColor}
                    onChange={setBorderColor}
                    aria-label={t('tools.image.borderColor')}
                  />
                </div>
                <button
                  type="button"
                  className={styles.btnGhostBlock}
                  disabled={!current || busy || borderWidth <= 0}
                  onClick={() =>
                    void withBusy(async () => {
                      commitImage(
                        await addBorder(requireImage(), { width: borderWidth, color: borderColor }),
                      )
                    })
                  }
                >
                  {t('tools.image.applyBorder')}
                </button>

                <label className={styles.field}>
                  <div className={styles.fieldHead}>
                    <span>{t('tools.image.roundCorners')}</span>
                    <span className={styles.fieldValue}>{cornerRadius}%</span>
                  </div>
                  <input
                    className={styles.range}
                    type="range"
                    min={0}
                    max={50}
                    value={cornerRadius}
                    onChange={(e) => setCornerRadius(Number(e.target.value))}
                  />
                </label>
                <button
                  type="button"
                  className={styles.btnPrimaryBlock}
                  disabled={!current || busy || cornerRadius <= 0}
                  onClick={() =>
                    void withBusy(async () => {
                      commitImage(await roundCorners(requireImage(), cornerRadius))
                    })
                  }
                >
                  {t('tools.image.applyRound')}
                </button>
              </>
            ) : null}

            {tab === 'smart' ? (
              <>
                <p className={styles.hint}>
                  {t('tools.image.smartHint')}{' '}
                  <Link to="/settings?section=image">{t('tools.image.openSettings')}</Link>
                </p>
                {smartTask === 'upscale' ? (
                  <div className={styles.field}>
                    <span className={styles.fieldLabel}>{t('tools.image.scale')}</span>
                    <div className={styles.chipGrid}>
                      {([2, 3, 4] as const).map((s) => (
                        <button
                          key={s}
                          type="button"
                          className={`${styles.chip} ${scale === s ? styles.chipActive : ''}`}
                          onClick={() => setScale(s)}
                        >
                          {s}x
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {smartTask === 'background_replace' ? (
                  <div className={styles.field}>
                    <span className={styles.fieldLabel}>{t('tools.image.fillColor')}</span>
                    <ColorField
                      value={fillColor}
                      onChange={setFillColor}
                      aria-label={t('tools.image.fillColor')}
                    />
                  </div>
                ) : null}
                <button
                  type="button"
                  className={styles.btnPrimaryBlock}
                  disabled={!current || busy}
                  onClick={() => void runSmart()}
                >
                  {t('tools.image.runSmart')}
                </button>
              </>
            ) : null}

            {tab === 'generate' ? (
              <>
                <p className={styles.hint}>{t('tools.image.generateHint')}</p>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>{t('tools.image.prompt')}</span>
                  <textarea
                    className={styles.textarea}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder={t('tools.image.promptPlaceholder')}
                    rows={5}
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>{t('tools.image.genModel')}</span>
                  <select
                    className={styles.select}
                    value={imageSettings?.defaultGenerateModelId || ''}
                    onChange={(e) => {
                      const defaultGenerateModelId = e.target.value
                      void window.treasureChest
                        .setImageToolsSettings({ defaultGenerateModelId })
                        .then(setImageSettings)
                    }}
                  >
                    <option value="">{t('tools.image.genModelDefault')}</option>
                    {imageModels.map((id) => (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>{t('tools.image.genSize')}</span>
                  <select
                    className={styles.select}
                    value={genSize}
                    onChange={(e) => setGenSize(e.target.value)}
                  >
                    <option value="1024x1024">1024×1024</option>
                    <option value="1792x1024">1792×1024</option>
                    <option value="1024x1792">1024×1792</option>
                  </select>
                </label>
                <button
                  type="button"
                  className={styles.btnPrimaryBlock}
                  disabled={busy || !prompt.trim()}
                  onClick={() =>
                    void withBusy(async () => {
                      const res = await window.treasureChest.generateImage({
                        prompt: prompt.trim(),
                        size: genSize,
                        model: imageSettings?.defaultGenerateModelId || undefined,
                      })
                      if (!res.ok || !res.url) {
                        setError(res.error || t('tools.image.genFailed'))
                        return
                      }
                      replaceImage(res.url)
                      setMessage(t('tools.image.genDone'))
                      setTab('classic')
                    })
                  }
                >
                  {t('tools.image.runGenerate')}
                </button>
              </>
            ) : null}
          </div>
        </aside>
      </div>
    </ToolShell>
  )
}

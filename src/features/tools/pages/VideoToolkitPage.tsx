import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { firstOutputModelId } from '@shared'
import { ToolShell } from '../components/ToolShell'
import { MultiTrackEditor } from '../components/MultiTrackEditor'
import styles from './VideoToolkitPage.module.css'

type TabId = 'classic' | 'timeline' | 'generate'
type ExportFormat = 'mp4' | 'webm' | 'mov' | 'gif' | 'mp3' | 'wav'

type GenItem = { id: string; url: string; prompt: string }

function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '—'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatBytes(n: number): string {
  if (!n) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const bytes = new Uint8Array(buf)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export function VideoToolkitPage(): React.JSX.Element {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [tab, setTab] = useState<TabId>('classic')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [progress, setProgress] = useState<number | null>(null)
  const [ffmpegOk, setFfmpegOk] = useState<boolean | null>(null)

  const [localPath, setLocalPath] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [fileSize, setFileSize] = useState(0)
  const [meta, setMeta] = useState({
    duration: 0,
    width: 0,
    height: 0,
    videoCodec: '',
    audioCodec: '',
    bitrate: 0,
  })

  const [trimStart, setTrimStart] = useState(0)
  const [trimEnd, setTrimEnd] = useState(0)
  const [mute, setMute] = useState(false)
  const [exportFormat, setExportFormat] = useState<ExportFormat>('mp4')
  const [maxEdge, setMaxEdge] = useState(0)
  const [speed, setSpeed] = useState(1)
  const [rotateDeg, setRotateDeg] = useState<0 | 90 | 180 | 270>(0)
  const [watermarkText, setWatermarkText] = useState('')
  const [watermarkPosition, setWatermarkPosition] = useState<
    'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center'
  >('bottom-right')
  const [watermarkImagePath, setWatermarkImagePath] = useState('')
  const [subtitlePath, setSubtitlePath] = useState('')
  const [subtitleFontSize, setSubtitleFontSize] = useState(20)
  const [subtitleColor, setSubtitleColor] = useState('#FFFFFF')
  const [brightness, setBrightness] = useState(1)
  const [contrast, setContrast] = useState(1)
  const [saturation, setSaturation] = useState(1)
  const [volume, setVolume] = useState(1)
  const [fadeInSec, setFadeInSec] = useState(0)
  const [fadeOutSec, setFadeOutSec] = useState(0)

  const [prompt, setPrompt] = useState('')
  const [aspectRatio, setAspectRatio] = useState('16:9')
  const [durationSec, setDurationSec] = useState(5)
  const [videoModels, setVideoModels] = useState<string[]>([])
  const [selectedModel, setSelectedModel] = useState('')
  const [genResults, setGenResults] = useState<GenItem[]>([])
  const [selectedGenId, setSelectedGenId] = useState<string | null>(null)
  const selectedGen = useMemo(
    () => genResults.find((g) => g.id === selectedGenId) ?? genResults[0] ?? null,
    [genResults, selectedGenId],
  )

  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)

  const refreshModels = useCallback(async () => {
    const fortune = (await window.treasureChest.getSettingsSnapshot()).fortune
    const active = fortune.aiProviders.find((p) => p.id === fortune.aiActiveProviderId)
    const ids =
      active?.models.filter((m) => m.outputModalities.includes('video')).map((m) => m.id) ?? []
    if (ids.length === 0 && active) {
      const legacy = firstOutputModelId(active.models, 'video')
      setVideoModels(legacy ? [legacy] : [])
    } else {
      setVideoModels(ids)
    }
  }, [])

  useEffect(() => {
    void refreshModels()
    void window.treasureChest.checkVideoFfmpeg().then((r) => setFfmpegOk(r.ok))
  }, [refreshModels])

  useEffect(() => {
    return window.treasureChest.onVideoProcessProgress((p) => {
      setProgress(p.ratio)
    })
  }, [])

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    const onPlay = (): void => setPlaying(true)
    const onPause = (): void => setPlaying(false)
    const onEnded = (): void => setPlaying(false)
    const onTime = (): void => setCurrentTime(el.currentTime || 0)
    el.addEventListener('play', onPlay)
    el.addEventListener('pause', onPause)
    el.addEventListener('ended', onEnded)
    el.addEventListener('timeupdate', onTime)
    return () => {
      el.removeEventListener('play', onPlay)
      el.removeEventListener('pause', onPause)
      el.removeEventListener('ended', onEnded)
      el.removeEventListener('timeupdate', onTime)
    }
  }, [previewUrl])

  const togglePlay = (): void => {
    const el = videoRef.current
    if (!el) return
    if (el.paused) void el.play()
    else el.pause()
  }

  const withBusy = async (fn: () => Promise<void>): Promise<void> => {
    setBusy(true)
    setError('')
    setMessage('')
    setProgress(null)
    try {
      await fn()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('tools.errors.generic'))
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  const applyOpened = (payload: {
    path: string
    previewUrl: string
    probe?: {
      duration?: number
      width?: number
      height?: number
      videoCodec?: string
      audioCodec?: string
      bitrate?: number
    }
    name?: string
    size?: number
  }): void => {
    setLocalPath(payload.path)
    setPreviewUrl(payload.previewUrl)
    setFileName(payload.name || payload.path.split(/[/\\]/).pop() || '')
    setFileSize(payload.size || 0)
    const dur = payload.probe?.duration || 0
    setMeta({
      duration: dur,
      width: payload.probe?.width || 0,
      height: payload.probe?.height || 0,
      videoCodec: payload.probe?.videoCodec || '',
      audioCodec: payload.probe?.audioCodec || '',
      bitrate: payload.probe?.bitrate || 0,
    })
    setTrimStart(0)
    setTrimEnd(dur > 0 ? Number(dur.toFixed(2)) : 0)
  }

  const openViaDialog = (): void => {
    void withBusy(async () => {
      const res = await window.treasureChest.pickLocalVideo()
      if (!res.ok || res.cancelled || !res.path || !res.previewUrl) {
        if (res.error) setError(res.error)
        return
      }
      applyOpened({
        path: res.path,
        previewUrl: res.previewUrl,
        probe: res.probe,
        name: res.name,
        size: res.size,
      })
    })
  }

  const importDropped = (file: File): void => {
    void withBusy(async () => {
      const dataBase64 = await fileToBase64(file)
      const res = await window.treasureChest.importLocalVideo({
        fileName: file.name,
        dataBase64,
      })
      if (!res.ok || !res.path || !res.previewUrl) {
        setError(res.error || t('tools.errors.generic'))
        return
      }
      applyOpened({
        path: res.path,
        previewUrl: res.previewUrl,
        probe: res.probe,
        name: file.name,
        size: file.size,
      })
    })
  }

  const captureFrame = (): void => {
    const video = videoRef.current
    if (!video || !video.videoWidth) {
      setError(t('tools.video.needVideo'))
      return
    }
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL('image/png')
    void withBusy(async () => {
      const res = await window.treasureChest.saveImageFile({
        dataUrl,
        defaultName: `frame-${Date.now()}.png`,
      })
      if (!res.ok) {
        if (res.error !== 'cancelled') setError(res.error || t('tools.errors.generic'))
        return
      }
      setMessage(t('tools.video.frameSaved', { path: res.path }))
    })
  }

  const markStart = (): void => {
    const v = videoRef.current
    if (!v) return
    const s = Number(v.currentTime.toFixed(2))
    setTrimStart(s)
    if (trimEnd > 0 && s >= trimEnd) setTrimEnd(Math.min(meta.duration || s + 0.1, s + 0.1))
  }

  const markEnd = (): void => {
    const v = videoRef.current
    if (!v) return
    const e = Number(v.currentTime.toFixed(2))
    setTrimEnd(e)
    if (e <= trimStart) setTrimStart(Math.max(0, e - 0.1))
  }

  const runExport = (): void => {
    if (!localPath) {
      setError(t('tools.video.needVideo'))
      return
    }
    if (ffmpegOk === false) {
      setError(t('tools.video.ffmpegMissing'))
      return
    }
    if (trimEnd > 0 && trimEnd <= trimStart) {
      setError(t('tools.video.trimInvalid'))
      return
    }
    void withBusy(async () => {
      const res = await window.treasureChest.processLocalVideo({
        inputPath: localPath,
        startSec: trimStart > 0 ? trimStart : undefined,
        endSec: trimEnd > 0 ? trimEnd : undefined,
        mute,
        format: exportFormat,
        maxEdge: maxEdge > 0 ? maxEdge : undefined,
        speed: speed !== 1 ? speed : undefined,
        rotateDeg: rotateDeg || undefined,
        watermarkText: watermarkText.trim() || undefined,
        watermarkPosition:
          watermarkText.trim() || watermarkImagePath ? watermarkPosition : undefined,
        watermarkImagePath: watermarkImagePath || undefined,
        subtitlePath: subtitlePath || undefined,
        subtitleFontSize: subtitlePath ? subtitleFontSize : undefined,
        subtitleColor: subtitlePath ? subtitleColor : undefined,
        brightness: brightness !== 1 ? brightness : undefined,
        contrast: contrast !== 1 ? contrast : undefined,
        saturation: saturation !== 1 ? saturation : undefined,
        volume: !mute && volume !== 1 ? volume : undefined,
        fadeInSec: !mute && fadeInSec > 0 ? fadeInSec : undefined,
        fadeOutSec: !mute && fadeOutSec > 0 ? fadeOutSec : undefined,
      })
      if (!res.ok) {
        if (res.error !== 'cancelled') setError(res.error || t('tools.video.exportFailed'))
        return
      }
      setMessage(t('tools.video.exportDone', { path: res.path }))
    })
  }

  const runGenerate = async (): Promise<void> => {
    const text = prompt.trim()
    if (!text) return
    await withBusy(async () => {
      const res = await window.treasureChest.generateVideo({
        prompt: text,
        model: selectedModel || undefined,
        durationSec,
        aspectRatio,
      })
      if (!res.ok || !res.url) {
        setError(res.error || t('tools.video.genFailed'))
        return
      }
      const id = `vgen-${Date.now()}`
      setGenResults((prev) => [{ id, url: res.url!, prompt: text }, ...prev].slice(0, 8))
      setSelectedGenId(id)
      setMessage(t('tools.video.genDone'))
    })
  }

  return (
    <ToolShell title={t('tools.video.title')} wide compact>
      <div className={styles.modeBar}>
        <div className={styles.modes}>
          {(['classic', 'timeline', 'generate'] as TabId[]).map((id) => (
            <button
              key={id}
              type="button"
              className={`${styles.mode} ${tab === id ? styles.modeActive : ''}`}
              onClick={() => setTab(id)}
            >
              {t(`tools.video.tab.${id}`)}
            </button>
          ))}
        </div>
        <div className={styles.fileActions}>
          {tab === 'classic' ? (
            <>
              <button
                type="button"
                className={styles.btnPrimary}
                disabled={busy}
                onClick={openViaDialog}
              >
                {t('tools.video.upload')}
              </button>
              <input
                ref={inputRef}
                type="file"
                accept="video/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) importDropped(f)
                }}
              />
              <button
                type="button"
                className={styles.btnGhost}
                disabled={!previewUrl || busy}
                onClick={captureFrame}
              >
                {t('tools.video.captureFrame')}
              </button>
            </>
          ) : tab === 'generate' ? (
            <button
              type="button"
              className={styles.btnGhost}
              disabled={!selectedGen || busy}
              onClick={() =>
                void withBusy(async () => {
                  if (!selectedGen) return
                  const res = await window.treasureChest.saveMediaFile({
                    url: selectedGen.url,
                    defaultName: `generated-${Date.now()}.mp4`,
                  })
                  if (!res.ok) {
                    if (res.error !== 'cancelled') setError(res.error || t('tools.errors.generic'))
                    return
                  }
                  setMessage(t('tools.video.saved', { path: res.path }))
                })
              }
            >
              {t('tools.video.save')}
            </button>
          ) : null}
        </div>
      </div>

      {tab === 'classic' ? (
        <div className={styles.layout}>
          <section className={styles.stage}>
            <div
              className={styles.hero}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                const file = e.dataTransfer.files?.[0]
                if (file?.type.startsWith('video/')) importDropped(file)
              }}
            >
              {previewUrl ? (
                <>
                  <div className={styles.playerFrame}>
                    <video
                      ref={videoRef}
                      className={styles.player}
                      src={previewUrl}
                      controls
                      playsInline
                      preload="metadata"
                    />
                  </div>
                  <div className={styles.transport}>
                    <button
                      type="button"
                      className={styles.transportBtn}
                      disabled={busy}
                      onClick={togglePlay}
                    >
                      {playing ? t('tools.video.pause') : t('tools.video.play')}
                    </button>
                    <button
                      type="button"
                      className={styles.transportBtn}
                      disabled={busy}
                      onClick={() => {
                        if (videoRef.current) videoRef.current.currentTime = trimStart
                      }}
                    >
                      {t('tools.video.jumpStart')}
                    </button>
                    <button
                      type="button"
                      className={styles.transportBtn}
                      disabled={busy}
                      onClick={markStart}
                    >
                      {t('tools.video.markStart')}
                    </button>
                    <button
                      type="button"
                      className={styles.transportBtn}
                      disabled={busy}
                      onClick={markEnd}
                    >
                      {t('tools.video.markEnd')}
                    </button>
                    <span className={styles.transportTime}>
                      {formatDuration(currentTime)} / {formatDuration(meta.duration)}
                    </span>
                  </div>
                  {meta.duration > 0 ? (
                    <div className={styles.timeline}>
                      <p className={styles.timelineCaption}>{t('tools.video.timelineHint')}</p>
                      <div className={styles.timelineRow}>
                        <span className={styles.timelineRowLabel}>{t('tools.video.trimRange')}</span>
                        <div className={styles.timelineTrack}>
                          <div
                            className={styles.timelineRange}
                            style={{
                              left: `${(trimStart / meta.duration) * 100}%`,
                              width: `${(Math.max(0, trimEnd - trimStart) / meta.duration) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                      <label className={styles.timelineRow}>
                        <span className={styles.timelineRowLabel}>
                          {t('tools.video.startSec')} · {formatDuration(trimStart)}
                        </span>
                        <input
                          type="range"
                          min={0}
                          max={meta.duration}
                          step={0.05}
                          value={trimStart}
                          disabled={busy}
                          aria-label={t('tools.video.startSec')}
                          onChange={(e) => {
                            const v = Number(e.target.value)
                            setTrimStart(v)
                            if (v >= trimEnd) setTrimEnd(Math.min(meta.duration, v + 0.1))
                            if (videoRef.current) videoRef.current.currentTime = v
                          }}
                        />
                      </label>
                      <label className={styles.timelineRow}>
                        <span className={styles.timelineRowLabel}>
                          {t('tools.video.endSec')} · {formatDuration(trimEnd || meta.duration)}
                        </span>
                        <input
                          type="range"
                          min={0}
                          max={meta.duration}
                          step={0.05}
                          value={trimEnd || meta.duration}
                          disabled={busy}
                          aria-label={t('tools.video.endSec')}
                          onChange={(e) => {
                            const v = Number(e.target.value)
                            setTrimEnd(v)
                            if (v <= trimStart) setTrimStart(Math.max(0, v - 0.1))
                            if (videoRef.current) videoRef.current.currentTime = v
                          }}
                        />
                      </label>
                      <p className={styles.timelineLabel}>
                        {t('tools.video.trimPreview', {
                          start: formatDuration(trimStart),
                          end: formatDuration(trimEnd || meta.duration),
                        })}
                      </p>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className={styles.empty}>
                  <p className={styles.emptyTitle}>{t('tools.video.dropHint')}</p>
                  <button type="button" className={styles.btnPrimary} onClick={openViaDialog}>
                    {t('tools.video.upload')}
                  </button>
                </div>
              )}
              {busy ? (
                <div className={styles.busyOverlay}>
                  {progress != null
                    ? t('tools.video.exportProgress', { pct: Math.round(progress * 100) })
                    : t('tools.video.working')}
                </div>
              ) : null}
            </div>
            {(message || error) && (
              <div className={styles.toastRow}>
                {message ? <p className={styles.toastOk}>{message}</p> : null}
                {error ? <p className={styles.toastErr}>{error}</p> : null}
              </div>
            )}
          </section>
          <aside className={styles.panel}>
            <div className={styles.panelHead}>
              <h2 className={styles.panelTitle}>{t('tools.video.info')}</h2>
              <p
                className={`${styles.ffmpegBadge} ${
                  ffmpegOk === false ? styles.ffmpegBad : styles.ffmpegOk
                }`}
              >
                {ffmpegOk == null
                  ? t('tools.video.ffmpegChecking')
                  : ffmpegOk
                    ? t('tools.video.ffmpegReady')
                    : t('tools.video.ffmpegMissing')}
              </p>
            </div>
            <div className={styles.panelBody}>
            <div className={styles.metaChips}>
              <div className={styles.chip}>
                <span className={styles.chipLabel}>{t('tools.video.fileName')}</span>
                <strong title={fileName || undefined}>{fileName || '—'}</strong>
              </div>
              <div className={styles.chip}>
                <span className={styles.chipLabel}>{t('tools.video.fileSize')}</span>
                <strong>{formatBytes(fileSize)}</strong>
              </div>
              <div className={styles.chip}>
                <span className={styles.chipLabel}>{t('tools.video.duration')}</span>
                <strong>{formatDuration(meta.duration)}</strong>
              </div>
              <div className={styles.chip}>
                <span className={styles.chipLabel}>{t('tools.video.resolution')}</span>
                <strong>
                  {meta.width && meta.height ? `${meta.width}×${meta.height}` : '—'}
                </strong>
              </div>
              <div className={styles.chipWide}>
                <span className={styles.chipLabel}>{t('tools.video.codec')}</span>
                <strong>
                  {[meta.videoCodec, meta.audioCodec].filter(Boolean).join(' / ') || '—'}
                </strong>
              </div>
            </div>

            <h3 className={styles.sectionTitle}>{t('tools.video.trim')}</h3>
            <div className={styles.row}>
              <button type="button" className={styles.btnGhost} disabled={!previewUrl || busy} onClick={markStart}>
                {t('tools.video.markStart')}
              </button>
              <button type="button" className={styles.btnGhost} disabled={!previewUrl || busy} onClick={markEnd}>
                {t('tools.video.markEnd')}
              </button>
            </div>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>
                {t('tools.video.startSec')} ({formatDuration(trimStart)})
              </span>
              <input
                className={styles.number}
                type="number"
                min={0}
                step={0.1}
                max={meta.duration || undefined}
                value={trimStart}
                disabled={!previewUrl || busy}
                onChange={(e) => setTrimStart(Number(e.target.value))}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>
                {t('tools.video.endSec')} ({formatDuration(trimEnd)})
              </span>
              <input
                className={styles.number}
                type="number"
                min={0}
                step={0.1}
                max={meta.duration || undefined}
                value={trimEnd}
                disabled={!previewUrl || busy}
                onChange={(e) => setTrimEnd(Number(e.target.value))}
              />
            </label>

            <h3 className={styles.sectionTitle}>{t('tools.video.grade')}</h3>
            {(
              [
                ['brightness', brightness, setBrightness],
                ['contrast', contrast, setContrast],
                ['saturation', saturation, setSaturation],
              ] as const
            ).map(([key, value, setter]) => (
              <label key={key} className={styles.field}>
                <span className={styles.fieldLabel}>
                  {t(`tools.video.${key}`)} ({value.toFixed(2)})
                </span>
                <input
                  className={styles.range}
                  type="range"
                  min={0.4}
                  max={1.6}
                  step={0.05}
                  value={value}
                  disabled={busy}
                  onChange={(e) => setter(Number(e.target.value))}
                />
              </label>
            ))}
            <button
              type="button"
              className={styles.btnGhost}
              disabled={busy}
              onClick={() => {
                setBrightness(1)
                setContrast(1)
                setSaturation(1)
              }}
            >
              {t('tools.video.resetGrade')}
            </button>

            <h3 className={styles.sectionTitle}>{t('tools.video.audioFx')}</h3>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>
                {t('tools.video.volume')} ({volume.toFixed(2)}×)
              </span>
              <input
                className={styles.range}
                type="range"
                min={0}
                max={2}
                step={0.05}
                value={volume}
                disabled={busy || mute}
                onChange={(e) => setVolume(Number(e.target.value))}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>
                {t('tools.video.fadeIn')} ({fadeInSec.toFixed(1)}s)
              </span>
              <input
                className={styles.range}
                type="range"
                min={0}
                max={10}
                step={0.1}
                value={fadeInSec}
                disabled={busy || mute}
                onChange={(e) => setFadeInSec(Number(e.target.value))}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>
                {t('tools.video.fadeOut')} ({fadeOutSec.toFixed(1)}s)
              </span>
              <input
                className={styles.range}
                type="range"
                min={0}
                max={10}
                step={0.1}
                value={fadeOutSec}
                disabled={busy || mute}
                onChange={(e) => setFadeOutSec(Number(e.target.value))}
              />
            </label>

            <h3 className={styles.sectionTitle}>{t('tools.video.export')}</h3>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>{t('tools.video.format')}</span>
              <select
                className={styles.select}
                value={exportFormat}
                disabled={busy}
                onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
              >
                <option value="mp4">MP4 (H.264)</option>
                <option value="webm">WebM (VP9)</option>
                <option value="mov">MOV</option>
                <option value="gif">GIF</option>
                <option value="mp3">MP3 (audio)</option>
                <option value="wav">WAV (audio)</option>
              </select>
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>{t('tools.video.maxEdge')}</span>
              <select
                className={styles.select}
                value={maxEdge}
                disabled={busy}
                onChange={(e) => setMaxEdge(Number(e.target.value))}
              >
                <option value={0}>{t('tools.video.maxEdgeKeep')}</option>
                <option value={1920}>1920px</option>
                <option value={1280}>1280px</option>
                <option value={720}>720px</option>
                <option value={480}>480px</option>
              </select>
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>{t('tools.video.speed')}</span>
              <select
                className={styles.select}
                value={speed}
                disabled={busy}
                onChange={(e) => setSpeed(Number(e.target.value))}
              >
                <option value={0.5}>0.5×</option>
                <option value={0.75}>0.75×</option>
                <option value={1}>1×</option>
                <option value={1.25}>1.25×</option>
                <option value={1.5}>1.5×</option>
                <option value={2}>2×</option>
              </select>
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>{t('tools.video.rotate')}</span>
              <select
                className={styles.select}
                value={rotateDeg}
                disabled={busy}
                onChange={(e) => setRotateDeg(Number(e.target.value) as 0 | 90 | 180 | 270)}
              >
                <option value={0}>{t('tools.video.rotateNone')}</option>
                <option value={90}>90°</option>
                <option value={180}>180°</option>
                <option value={270}>270°</option>
              </select>
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>{t('tools.video.watermark')}</span>
              <input
                className={styles.number}
                type="text"
                value={watermarkText}
                disabled={busy}
                placeholder={t('tools.video.watermarkPlaceholder')}
                onChange={(e) => setWatermarkText(e.target.value)}
              />
            </label>
            <div className={styles.row}>
              <button
                type="button"
                className={styles.btnGhost}
                disabled={busy}
                onClick={() =>
                  void withBusy(async () => {
                    const p = await window.treasureChest.pickVideoImage()
                    if (p) setWatermarkImagePath(p)
                  })
                }
              >
                {t('tools.video.pickWmImage')}
              </button>
              {watermarkImagePath ? (
                <button
                  type="button"
                  className={styles.btnGhost}
                  disabled={busy}
                  onClick={() => setWatermarkImagePath('')}
                >
                  {t('tools.video.clearWmImage')}
                </button>
              ) : null}
            </div>
            {watermarkImagePath ? (
              <p className={styles.hint} title={watermarkImagePath}>
                {t('tools.video.wmImage')}: {watermarkImagePath.split(/[/\\]/).pop()}
              </p>
            ) : null}
            <div className={styles.row}>
              <button
                type="button"
                className={styles.btnGhost}
                disabled={busy}
                onClick={() =>
                  void withBusy(async () => {
                    const p = await window.treasureChest.pickVideoSubtitle()
                    if (p) setSubtitlePath(p)
                  })
                }
              >
                {t('tools.video.pickSubtitle')}
              </button>
              {subtitlePath ? (
                <button
                  type="button"
                  className={styles.btnGhost}
                  disabled={busy}
                  onClick={() => setSubtitlePath('')}
                >
                  {t('tools.video.clearSubtitle')}
                </button>
              ) : null}
            </div>
            {subtitlePath ? (
              <>
                <p className={styles.hint} title={subtitlePath}>
                  {t('tools.video.subtitle')}: {subtitlePath.split(/[/\\]/).pop()}
                </p>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>
                    {t('tools.video.subFontSize')} ({subtitleFontSize})
                  </span>
                  <input
                    className={styles.range}
                    type="range"
                    min={14}
                    max={48}
                    value={subtitleFontSize}
                    disabled={busy}
                    onChange={(e) => setSubtitleFontSize(Number(e.target.value))}
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>{t('tools.video.subColor')}</span>
                  <input
                    type="color"
                    value={subtitleColor}
                    disabled={busy}
                    onChange={(e) => setSubtitleColor(e.target.value)}
                  />
                </label>
              </>
            ) : null}
            {watermarkText.trim() || watermarkImagePath ? (
              <label className={styles.field}>
                <span className={styles.fieldLabel}>{t('tools.video.wmPosition')}</span>
                <select
                  className={styles.select}
                  value={watermarkPosition}
                  disabled={busy}
                  onChange={(e) =>
                    setWatermarkPosition(
                      e.target.value as
                        | 'top-left'
                        | 'top-right'
                        | 'bottom-left'
                        | 'bottom-right'
                        | 'center',
                    )
                  }
                >
                  <option value="top-left">{t('tools.video.pos.tl')}</option>
                  <option value="top-right">{t('tools.video.pos.tr')}</option>
                  <option value="center">{t('tools.video.pos.c')}</option>
                  <option value="bottom-left">{t('tools.video.pos.bl')}</option>
                  <option value="bottom-right">{t('tools.video.pos.br')}</option>
                </select>
              </label>
            ) : null}
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={mute}
                disabled={busy || exportFormat === 'mp3' || exportFormat === 'wav'}
                onChange={(e) => setMute(e.target.checked)}
              />
              <span>{t('tools.video.mute')}</span>
            </label>
            <button
              type="button"
              className={styles.btnPrimaryBlock}
              disabled={!localPath || busy || ffmpegOk === false}
              onClick={runExport}
            >
              {t('tools.video.runExport')}
            </button>
            <button
              type="button"
              className={styles.btnGhostBlock}
              disabled={busy || ffmpegOk === false}
              onClick={() =>
                void withBusy(async () => {
                  const res = await window.treasureChest.concatLocalVideos()
                  if (!res.ok) {
                    if (res.error !== 'cancelled') setError(res.error || t('tools.video.concatFailed'))
                    return
                  }
                  setMessage(t('tools.video.concatDone', { path: res.path }))
                })
              }
            >
              {t('tools.video.concat')}
            </button>
            <p className={styles.hint}>{t('tools.video.classicHint')}</p>
            </div>
          </aside>
        </div>
      ) : tab === 'timeline' ? (
        <MultiTrackEditor
          busy={busy}
          ffmpegOk={ffmpegOk}
          onBusy={withBusy}
          onMessage={setMessage}
          onError={setError}
        />
      ) : (
        <div className={styles.genStudio}>
          <aside className={styles.genPanel}>
            <div className={styles.genPanelHead}>
              <h2 className={styles.panelTitle}>{t('tools.video.generate')}</h2>
              <p className={styles.hint}>{t('tools.video.generateHint')}</p>
            </div>
            <div className={styles.genPanelBody}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>{t('tools.video.prompt')}</span>
                <textarea
                  className={styles.textarea}
                  rows={7}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={t('tools.video.promptPlaceholder')}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>{t('tools.video.genModel')}</span>
                <select
                  className={styles.select}
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                >
                  <option value="">{t('tools.video.genModelDefault')}</option>
                  {videoModels.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              </label>
              {videoModels.length === 0 ? (
                <p className={styles.hint}>
                  {t('tools.video.needVideoModel')}{' '}
                  <Link className={styles.link} to="/settings">
                    {t('tools.video.openSettings')}
                  </Link>
                </p>
              ) : null}
              <label className={styles.field}>
                <span className={styles.fieldLabel}>{t('tools.video.aspect')}</span>
                <select
                  className={styles.select}
                  value={aspectRatio}
                  onChange={(e) => setAspectRatio(e.target.value)}
                >
                  <option value="16:9">16:9</option>
                  <option value="9:16">9:16</option>
                  <option value="1:1">1:1</option>
                </select>
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>{t('tools.video.durationSec')}</span>
                <select
                  className={styles.select}
                  value={durationSec}
                  onChange={(e) => setDurationSec(Number(e.target.value))}
                >
                  <option value={5}>5s</option>
                  <option value={10}>10s</option>
                </select>
              </label>
              <button
                type="button"
                className={styles.btnPrimaryBlock}
                disabled={busy || !prompt.trim()}
                onClick={() => void runGenerate()}
              >
                {busy ? t('tools.video.working') : t('tools.video.runGenerate')}
              </button>
              {(message || error) && (
                <div className={styles.toastRow}>
                  {message ? <p className={styles.toastOk}>{message}</p> : null}
                  {error ? <p className={styles.toastErr}>{error}</p> : null}
                </div>
              )}
            </div>
          </aside>
          <section className={styles.genStage}>
            <div className={styles.hero}>
              {selectedGen ? (
                <video className={styles.player} src={selectedGen.url} controls />
              ) : (
                <div className={styles.empty}>
                  <p className={styles.emptyTitle}>{t('tools.video.genEmptyTitle')}</p>
                  <p className={styles.emptyDesc}>{t('tools.video.genEmptyDesc')}</p>
                </div>
              )}
              {busy ? <div className={styles.busyOverlay}>{t('tools.video.working')}</div> : null}
            </div>
            {selectedGen ? (
              <p className={styles.caption} title={selectedGen.prompt}>
                {selectedGen.prompt}
              </p>
            ) : null}
            {genResults.length > 1 ? (
              <div className={styles.thumbs}>
                {genResults.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`${styles.thumb} ${item.id === selectedGen?.id ? styles.thumbActive : ''}`}
                    onClick={() => setSelectedGenId(item.id)}
                    title={item.prompt}
                  >
                    <video src={item.url} muted preload="metadata" />
                  </button>
                ))}
              </div>
            ) : null}
          </section>
        </div>
      )}
    </ToolShell>
  )
}

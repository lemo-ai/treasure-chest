import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { firstOutputModelId } from '@shared'
import { ToolShell } from '../components/ToolShell'
import styles from './VideoToolkitPage.module.css'
import audioStyles from './AudioToolkitPage.module.css'

type TabId = 'classic' | 'generate' | 'transcribe'
type ExportFormat = 'mp3' | 'wav' | 'aac' | 'm4a' | 'ogg' | 'flac'

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

export function AudioToolkitPage(): React.JSX.Element {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
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
    audioCodec: '',
    bitrate: 0,
    sampleRate: 0,
    channels: 0,
  })

  const [trimStart, setTrimStart] = useState(0)
  const [trimEnd, setTrimEnd] = useState(0)
  const [exportFormat, setExportFormat] = useState<ExportFormat>('mp3')
  const [volume, setVolume] = useState(1)
  const [fadeInSec, setFadeInSec] = useState(0)
  const [fadeOutSec, setFadeOutSec] = useState(0)
  const [normalize, setNormalize] = useState(false)
  const [speed, setSpeed] = useState(1)

  const [prompt, setPrompt] = useState('')
  const [durationSec, setDurationSec] = useState(60)
  const [style, setStyle] = useState('')
  const [instrumental, setInstrumental] = useState(true)
  const [musicModels, setMusicModels] = useState<string[]>([])
  const [selectedModel, setSelectedModel] = useState('')
  const [genResults, setGenResults] = useState<GenItem[]>([])
  const [selectedGenId, setSelectedGenId] = useState<string | null>(null)
  const selectedGen = useMemo(
    () => genResults.find((g) => g.id === selectedGenId) ?? genResults[0] ?? null,
    [genResults, selectedGenId],
  )

  const [transcript, setTranscript] = useState('')

  const refreshModels = useCallback(async () => {
    const fortune = (await window.treasureChest.getSettingsSnapshot()).fortune
    const active = fortune.aiProviders.find((p) => p.id === fortune.aiActiveProviderId)
    const ids =
      active?.models.filter((m) => m.outputModalities.includes('audio')).map((m) => m.id) ?? []
    if (ids.length === 0 && active) {
      const legacy = firstOutputModelId(active.models, 'audio')
      setMusicModels(legacy ? [legacy] : [])
      setSelectedModel(legacy || '')
      return
    }
    setMusicModels(ids)
    setSelectedModel((prev) => (prev && ids.includes(prev) ? prev : ids[0] || ''))
  }, [])

  useEffect(() => {
    void refreshModels()
    void window.treasureChest.checkVideoFfmpeg().then((r) => setFfmpegOk(r.ok))
    return window.treasureChest.onAudioProcessProgress((p) => {
      setProgress(Math.round(p.ratio * 100))
    })
  }, [refreshModels])

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

  const applyProbe = (payload: {
    path: string
    previewUrl?: string
    probe?: {
      duration?: number
      audioCodec?: string
      bitrate?: number
      sampleRate?: number
      channels?: number
    }
    name?: string
    size?: number
  }): void => {
    setLocalPath(payload.path)
    setPreviewUrl(payload.previewUrl || null)
    setFileName(payload.name || payload.path.split(/[/\\]/).pop() || '')
    setFileSize(payload.size || 0)
    const dur = payload.probe?.duration || 0
    setMeta({
      duration: dur,
      audioCodec: payload.probe?.audioCodec || '',
      bitrate: payload.probe?.bitrate || 0,
      sampleRate: payload.probe?.sampleRate || 0,
      channels: payload.probe?.channels || 0,
    })
    setTrimStart(0)
    setTrimEnd(dur)
  }

  const openPicked = (): void => {
    void withBusy(async () => {
      const res = await window.treasureChest.pickLocalAudio()
      if (!res.ok) {
        if (!res.cancelled) setError(res.error || t('tools.audio.openFailed'))
        return
      }
      applyProbe({
        path: res.path!,
        previewUrl: res.previewUrl,
        probe: res.probe,
        name: res.name,
        size: res.size,
      })
      setMessage(t('tools.audio.opened'))
    })
  }

  const onDropFile = (file: File | null): void => {
    if (!file) return
    void withBusy(async () => {
      const dataBase64 = await fileToBase64(file)
      const res = await window.treasureChest.importLocalAudio({
        fileName: file.name,
        dataBase64,
      })
      if (!res.ok || !res.path) {
        setError(res.error || t('tools.audio.openFailed'))
        return
      }
      applyProbe({
        path: res.path,
        previewUrl: res.previewUrl,
        probe: res.probe,
        name: file.name,
        size: file.size,
      })
      setMessage(t('tools.audio.opened'))
    })
  }

  const markStart = (): void => {
    const t0 = audioRef.current?.currentTime ?? 0
    setTrimStart(t0)
    if (trimEnd && t0 >= trimEnd) setTrimEnd(Math.min(meta.duration, t0 + 0.1))
  }

  const markEnd = (): void => {
    const t0 = audioRef.current?.currentTime ?? meta.duration
    setTrimEnd(t0)
    if (t0 <= trimStart) setTrimStart(Math.max(0, t0 - 0.1))
  }

  const runExport = (): void => {
    if (!localPath) {
      setError(t('tools.audio.needAudio'))
      return
    }
    if (trimEnd > 0 && trimEnd <= trimStart) {
      setError(t('tools.audio.trimInvalid'))
      return
    }
    void withBusy(async () => {
      const res = await window.treasureChest.processLocalAudio({
        inputPath: localPath,
        startSec: trimStart > 0 ? trimStart : undefined,
        endSec: trimEnd > 0 && trimEnd < meta.duration ? trimEnd : undefined,
        format: exportFormat,
        volume: volume !== 1 ? volume : undefined,
        fadeInSec: fadeInSec > 0 ? fadeInSec : undefined,
        fadeOutSec: fadeOutSec > 0 ? fadeOutSec : undefined,
        normalize: normalize || undefined,
        speed: speed !== 1 ? speed : undefined,
      })
      if (!res.ok) {
        if (res.error !== 'cancelled') setError(res.error || t('tools.audio.exportFailed'))
        return
      }
      setMessage(t('tools.audio.exportDone', { path: res.path }))
    })
  }

  const runConcat = (): void => {
    void withBusy(async () => {
      const res = await window.treasureChest.concatLocalAudios({ format: exportFormat })
      if (!res.ok) {
        if (res.error !== 'cancelled') setError(res.error || t('tools.audio.concatFailed'))
        return
      }
      setMessage(t('tools.audio.concatDone', { path: res.path }))
    })
  }

  const runGenerate = (): void => {
    const p = prompt.trim()
    if (!p) {
      setError(t('tools.audio.needPrompt'))
      return
    }
    void withBusy(async () => {
      const res = await window.treasureChest.generateMusic({
        prompt: p,
        model: selectedModel || undefined,
        durationSec,
        style: style.trim() || undefined,
        instrumental,
      })
      if (!res.ok || !res.url) {
        setError(res.error || t('tools.audio.genFailed'))
        return
      }
      const item: GenItem = { id: `${Date.now()}`, url: res.url, prompt: p }
      setGenResults((prev) => [item, ...prev])
      setSelectedGenId(item.id)
      setMessage(t('tools.audio.genDone'))
    })
  }

  const runTranscribe = (): void => {
    void withBusy(async () => {
      const filePath = localPath || (await window.treasureChest.pickAudioFile())
      if (!filePath) {
        setMessage(t('tools.audio.transcribeCancelled'))
        return
      }
      const res = await window.treasureChest.transcribeAudio({ filePath })
      if (!res.ok || !res.text) {
        setError(res.error || t('tools.audio.transcribeFailed'))
        return
      }
      setTranscript(res.text)
      setMessage(t('tools.audio.transcribeDone'))
    })
  }

  return (
    <ToolShell title={t('tools.audio.title')} subtitle={t('tools.audio.desc')} wide compact>
      <div className={audioStyles.pageFill}>
      <div className={styles.modeBar}>
        <div className={styles.modes}>
          {(['classic', 'generate', 'transcribe'] as const).map((id) => (
            <button
              key={id}
              type="button"
              className={`${styles.mode} ${tab === id ? styles.modeActive : ''}`}
              onClick={() => setTab(id)}
            >
              {t(`tools.audio.tab.${id}`)}
            </button>
          ))}
        </div>
        {tab === 'classic' ? (
          <div className={styles.fileActions}>
            <button type="button" className={styles.btnPrimary} disabled={busy} onClick={openPicked}>
              {t('tools.audio.upload')}
            </button>
            <button type="button" className={styles.btnGhost} disabled={busy} onClick={runConcat}>
              {t('tools.audio.concat')}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="audio/*,video/*"
              hidden
              onChange={(e) => {
                onDropFile(e.target.files?.[0] ?? null)
                e.target.value = ''
              }}
            />
          </div>
        ) : null}
      </div>

      {tab === 'classic' ? (
        <div className={`${styles.layout} ${audioStyles.layout}`}>
          <section className={styles.stage}>
            <div
              className={`${styles.hero} ${audioStyles.hero}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                onDropFile(e.dataTransfer.files?.[0] ?? null)
              }}
            >
              {previewUrl ? (
                <>
                  <div className={`${styles.playerFrame} ${audioStyles.playerFrame}`}>
                    <audio
                      ref={audioRef}
                      className={`${styles.player} ${audioStyles.player}`}
                      src={previewUrl}
                      controls
                      preload="metadata"
                    />
                  </div>
                  {meta.duration > 0 ? (
                    <div className={styles.timeline}>
                      <div className={styles.timelineTrack}>
                        <div
                          className={styles.timelineRange}
                          style={{
                            left: `${(trimStart / meta.duration) * 100}%`,
                            width: `${(Math.max(0, trimEnd - trimStart) / meta.duration) * 100}%`,
                          }}
                        />
                      </div>
                      <div className={styles.timelineInputs}>
                        <input
                          type="range"
                          min={0}
                          max={meta.duration}
                          step={0.05}
                          value={trimStart}
                          disabled={busy}
                          onChange={(e) => {
                            const v = Number(e.target.value)
                            setTrimStart(v)
                            if (v >= trimEnd) setTrimEnd(Math.min(meta.duration, v + 0.1))
                            if (audioRef.current) audioRef.current.currentTime = v
                          }}
                        />
                        <input
                          type="range"
                          min={0}
                          max={meta.duration}
                          step={0.05}
                          value={trimEnd || meta.duration}
                          disabled={busy}
                          onChange={(e) => {
                            const v = Number(e.target.value)
                            setTrimEnd(v)
                            if (v <= trimStart) setTrimStart(Math.max(0, v - 0.1))
                            if (audioRef.current) audioRef.current.currentTime = v
                          }}
                        />
                      </div>
                      <p className={styles.timelineLabel}>
                        {formatDuration(trimStart)} → {formatDuration(trimEnd || meta.duration)}
                      </p>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className={styles.empty}>
                  <p className={styles.emptyTitle}>{t('tools.audio.dropHint')}</p>
                  <button type="button" className={styles.btnPrimary} onClick={openPicked}>
                    {t('tools.audio.upload')}
                  </button>
                </div>
              )}
              {busy ? (
                <div className={styles.busyOverlay}>
                  {progress != null
                    ? t('tools.audio.exportProgress', { pct: progress })
                    : t('tools.audio.working')}
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

          <aside className={`${styles.panel} ${audioStyles.panel}`}>
            <div className={styles.panelHead}>
              <h2 className={styles.panelTitle}>{t('tools.audio.info')}</h2>
              <p
                className={`${styles.ffmpegBadge} ${
                  ffmpegOk === false ? styles.ffmpegBad : styles.ffmpegOk
                }`}
              >
                {ffmpegOk == null
                  ? t('tools.audio.ffmpegChecking')
                  : ffmpegOk
                    ? t('tools.audio.ffmpegReady')
                    : t('tools.audio.ffmpegMissing')}
              </p>
            </div>
            <div className={styles.panelBody}>
            <div className={styles.metaChips}>
              <div className={styles.chip}>
                <span className={styles.chipLabel}>{t('tools.audio.fileName')}</span>
                <strong title={fileName}>{fileName || '—'}</strong>
              </div>
              <div className={styles.chip}>
                <span className={styles.chipLabel}>{t('tools.audio.fileSize')}</span>
                <strong>{formatBytes(fileSize)}</strong>
              </div>
              <div className={styles.chip}>
                <span className={styles.chipLabel}>{t('tools.audio.duration')}</span>
                <strong>{formatDuration(meta.duration)}</strong>
              </div>
              <div className={styles.chip}>
                <span className={styles.chipLabel}>{t('tools.audio.codec')}</span>
                <strong>{meta.audioCodec || '—'}</strong>
              </div>
              <div className={styles.chip}>
                <span className={styles.chipLabel}>{t('tools.audio.sampleRate')}</span>
                <strong>{meta.sampleRate ? `${meta.sampleRate} Hz` : '—'}</strong>
              </div>
              <div className={styles.chip}>
                <span className={styles.chipLabel}>{t('tools.audio.channels')}</span>
                <strong>{meta.channels || '—'}</strong>
              </div>
            </div>

            <h3 className={styles.sectionTitle}>{t('tools.audio.trim')}</h3>
            <div className={styles.row}>
              <button type="button" className={styles.btnGhost} disabled={!previewUrl || busy} onClick={markStart}>
                {t('tools.audio.markStart')}
              </button>
              <button type="button" className={styles.btnGhost} disabled={!previewUrl || busy} onClick={markEnd}>
                {t('tools.audio.markEnd')}
              </button>
            </div>

            <h3 className={styles.sectionTitle}>{t('tools.audio.process')}</h3>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>
                {t('tools.audio.volume')} ({volume.toFixed(2)}×)
              </span>
              <input
                className={styles.range}
                type="range"
                min={0}
                max={2}
                step={0.05}
                value={volume}
                disabled={busy}
                onChange={(e) => setVolume(Number(e.target.value))}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>
                {t('tools.audio.fadeIn')} ({fadeInSec.toFixed(1)}s)
              </span>
              <input
                className={styles.range}
                type="range"
                min={0}
                max={10}
                step={0.1}
                value={fadeInSec}
                disabled={busy}
                onChange={(e) => setFadeInSec(Number(e.target.value))}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>
                {t('tools.audio.fadeOut')} ({fadeOutSec.toFixed(1)}s)
              </span>
              <input
                className={styles.range}
                type="range"
                min={0}
                max={10}
                step={0.1}
                value={fadeOutSec}
                disabled={busy}
                onChange={(e) => setFadeOutSec(Number(e.target.value))}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>
                {t('tools.audio.speed')} ({speed.toFixed(2)}×)
              </span>
              <input
                className={styles.range}
                type="range"
                min={0.5}
                max={2}
                step={0.05}
                value={speed}
                disabled={busy}
                onChange={(e) => setSpeed(Number(e.target.value))}
              />
            </label>
            <label className={styles.checkRow}>
              <input
                type="checkbox"
                checked={normalize}
                disabled={busy}
                onChange={(e) => setNormalize(e.target.checked)}
              />
              <span>{t('tools.audio.normalize')}</span>
            </label>

            <h3 className={styles.sectionTitle}>{t('tools.audio.export')}</h3>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>{t('tools.audio.format')}</span>
              <select
                className={styles.select}
                value={exportFormat}
                disabled={busy}
                onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
              >
                <option value="mp3">MP3</option>
                <option value="wav">WAV</option>
                <option value="aac">AAC</option>
                <option value="m4a">M4A</option>
                <option value="ogg">OGG</option>
                <option value="flac">FLAC</option>
              </select>
            </label>
            <button
              type="button"
              className={styles.btnPrimaryBlock}
              disabled={!localPath || busy || ffmpegOk === false}
              onClick={runExport}
            >
              {t('tools.audio.runExport')}
            </button>
            </div>
          </aside>
        </div>
      ) : null}

      {tab === 'generate' ? (
        <div className={`${styles.genStudio} ${audioStyles.genStudio}`}>
          <aside className={`${styles.panel} ${audioStyles.panel}`}>
            <h2 className={styles.panelTitle}>{t('tools.audio.generate')}</h2>
            <p className={styles.banner}>{t('tools.audio.generateHint')}</p>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>{t('tools.audio.prompt')}</span>
              <textarea
                className={styles.textarea}
                rows={5}
                value={prompt}
                disabled={busy}
                placeholder={t('tools.audio.promptPlaceholder')}
                onChange={(e) => setPrompt(e.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>{t('tools.audio.genModel')}</span>
              <select
                className={styles.select}
                value={selectedModel}
                disabled={busy || musicModels.length === 0}
                onChange={(e) => setSelectedModel(e.target.value)}
              >
                {musicModels.length === 0 ? (
                  <option value="">{t('tools.audio.genModelDefault')}</option>
                ) : (
                  musicModels.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))
                )}
              </select>
            </label>
            {musicModels.length === 0 ? (
              <p className={styles.hint}>
                {t('tools.audio.needMusicModel')}{' '}
                <Link to="/settings">{t('tools.audio.openSettings')}</Link>
              </p>
            ) : null}
            <label className={styles.field}>
              <span className={styles.fieldLabel}>{t('tools.audio.style')}</span>
              <input
                className={styles.input}
                value={style}
                disabled={busy}
                placeholder={t('tools.audio.stylePlaceholder')}
                onChange={(e) => setStyle(e.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>{t('tools.audio.durationSec')}</span>
              <input
                className={styles.number}
                type="number"
                min={10}
                max={240}
                value={durationSec}
                disabled={busy}
                onChange={(e) => setDurationSec(Number(e.target.value))}
              />
            </label>
            <label className={styles.checkRow}>
              <input
                type="checkbox"
                checked={instrumental}
                disabled={busy}
                onChange={(e) => setInstrumental(e.target.checked)}
              />
              <span>{t('tools.audio.instrumental')}</span>
            </label>
            <button
              type="button"
              className={styles.btnPrimaryBlock}
              disabled={busy}
              onClick={runGenerate}
            >
              {t('tools.audio.runGenerate')}
            </button>
            {(message || error) && (
              <div className={styles.toastRow}>
                {message ? <p className={styles.toastOk}>{message}</p> : null}
                {error ? <p className={styles.toastErr}>{error}</p> : null}
              </div>
            )}
          </aside>
          <section className={styles.genStage}>
            <div className={`${styles.hero} ${audioStyles.hero}`}>
              {selectedGen ? (
                <div className={`${styles.playerFrame} ${audioStyles.playerFrame}`}>
                  <audio
                    className={`${styles.player} ${audioStyles.player}`}
                    src={selectedGen.url}
                    controls
                  />
                </div>
              ) : (
                <div className={styles.empty}>
                  <strong>{t('tools.audio.genEmptyTitle')}</strong>
                  <span>{t('tools.audio.genEmptyDesc')}</span>
                </div>
              )}
              {busy ? <div className={styles.busyOverlay}>{t('tools.audio.working')}</div> : null}
            </div>
            {genResults.length > 1 ? (
              <div className={styles.row}>
                {genResults.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    className={styles.btnGhost}
                    onClick={() => setSelectedGenId(g.id)}
                  >
                    {g.prompt.slice(0, 24) || g.id}
                  </button>
                ))}
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      {tab === 'transcribe' ? (
        <div className={`${styles.layout} ${audioStyles.layout}`}>
          <section className={styles.stage}>
            <p className={styles.banner}>{t('tools.audio.transcribeHint')}</p>
            <div className={`${styles.hero} ${audioStyles.hero}`} style={{ alignItems: 'stretch' }}>
              <textarea
                className={styles.textarea}
                style={{ flex: 1, minHeight: 280, resize: 'vertical' }}
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder={t('tools.audio.transcribePlaceholder')}
                spellCheck={false}
              />
              {busy ? <div className={styles.busyOverlay}>{t('tools.audio.working')}</div> : null}
            </div>
            {(message || error) && (
              <div className={styles.toastRow}>
                {message ? <p className={styles.toastOk}>{message}</p> : null}
                {error ? <p className={styles.toastErr}>{error}</p> : null}
              </div>
            )}
          </section>
          <aside className={`${styles.panel} ${audioStyles.panel}`}>
            <h2 className={styles.panelTitle}>{t('tools.audio.transcribe')}</h2>
            <p className={styles.hint}>{t('tools.audio.transcribePanelHint')}</p>
            {localPath ? (
              <p className={styles.hint} title={localPath}>
                {t('tools.audio.fileName')}: {fileName || localPath.split(/[/\\]/).pop()}
              </p>
            ) : null}
            <button
              type="button"
              className={styles.btnPrimaryBlock}
              disabled={busy}
              onClick={runTranscribe}
            >
              {localPath ? t('tools.audio.transcribeCurrent') : t('tools.audio.transcribePick')}
            </button>
            <button
              type="button"
              className={styles.btnGhost}
              disabled={busy || !transcript}
              onClick={() => {
                void navigator.clipboard.writeText(transcript)
                setMessage(t('tools.audio.copied'))
              }}
            >
              {t('tools.audio.copy')}
            </button>
          </aside>
        </div>
      ) : null}
      </div>
    </ToolShell>
  )
}

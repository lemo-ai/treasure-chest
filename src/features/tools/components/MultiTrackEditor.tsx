import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import styles from '../pages/VideoToolkitPage.module.css'

export type TrackId = 'V1' | 'A1' | 'OV1'

export type TimelineClip = {
  id: string
  path: string
  name: string
  kind: 'video' | 'audio' | 'image'
  track: TrackId
  duration: number
  inSec: number
  outSec: number
  startSec: number
  volume: number
}

type Props = {
  busy: boolean
  ffmpegOk: boolean | null
  onBusy: (fn: () => Promise<void>) => Promise<void>
  onMessage: (msg: string) => void
  onError: (msg: string) => void
}

function clipLen(c: TimelineClip): number {
  const out = c.outSec > c.inSec ? c.outSec : c.duration
  return Math.max(0.1, out - c.inSec)
}

export function MultiTrackEditor({
  busy,
  ffmpegOk,
  onBusy,
  onMessage,
  onError,
}: Props): React.JSX.Element {
  const { t } = useTranslation()
  const [clips, setClips] = useState<TimelineClip[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [muteVideoAudio, setMuteVideoAudio] = useState(false)
  const [width, setWidth] = useState(1280)
  const [height, setHeight] = useState(720)
  const selected = useMemo(
    () => clips.find((c) => c.id === selectedId) ?? null,
    [clips, selectedId],
  )

  const totalDur = useMemo(() => {
    const v = clips.filter((c) => c.track === 'V1')
    if (v.length === 0) return 1
    return Math.max(
      1,
      v.reduce((sum, c) => sum + clipLen(c), 0),
      ...clips.map((c) => c.startSec + clipLen(c)),
    )
  }, [clips])

  const pxPerSec = Math.min(48, Math.max(12, 640 / totalDur))

  const addVideoClips = (): void => {
    void onBusy(async () => {
      // Reuse concat picker via multi pick: pick one at a time with pickLocalVideo
      const res = await window.treasureChest.pickLocalVideo()
      if (!res.ok || res.cancelled || !res.path) return
      const dur = res.probe?.duration || 1
      const clip: TimelineClip = {
        id: `v-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        path: res.path,
        name: res.name || res.path.split(/[/\\]/).pop() || 'video',
        kind: 'video',
        track: 'V1',
        duration: dur,
        inSec: 0,
        outSec: dur,
        startSec: clips.filter((c) => c.track === 'V1').reduce((s, c) => s + clipLen(c), 0),
        volume: 1,
      }
      setClips((prev) => [...prev, clip])
      setSelectedId(clip.id)
    })
  }

  const addAudioClip = (): void => {
    void onBusy(async () => {
      const res = await window.treasureChest.pickLocalAudio()
      if (!res.ok || res.cancelled || !res.path) return
      const dur = res.probe?.duration || 1
      const clip: TimelineClip = {
        id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        path: res.path,
        name: res.name || res.path.split(/[/\\]/).pop() || 'audio',
        kind: 'audio',
        track: 'A1',
        duration: dur,
        inSec: 0,
        outSec: dur,
        startSec: 0,
        volume: 0.8,
      }
      setClips((prev) => [...prev.filter((c) => c.track !== 'A1'), clip])
      setSelectedId(clip.id)
    })
  }

  const addOverlay = (): void => {
    void onBusy(async () => {
      const path = await window.treasureChest.pickVideoImage()
      if (!path) return
      const clip: TimelineClip = {
        id: `o-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        path,
        name: path.split(/[/\\]/).pop() || 'overlay',
        kind: 'image',
        track: 'OV1',
        duration: totalDur,
        inSec: 0,
        outSec: totalDur,
        startSec: 0,
        volume: 1,
      }
      setClips((prev) => [...prev.filter((c) => c.track !== 'OV1'), clip])
      setSelectedId(clip.id)
    })
  }

  const patchSelected = (partial: Partial<TimelineClip>): void => {
    if (!selectedId) return
    setClips((prev) => prev.map((c) => (c.id === selectedId ? { ...c, ...partial } : c)))
  }

  const removeSelected = (): void => {
    if (!selectedId) return
    setClips((prev) => prev.filter((c) => c.id !== selectedId))
    setSelectedId(null)
  }

  const moveV1 = (dir: -1 | 1): void => {
    if (!selected || selected.track !== 'V1') return
    setClips((prev) => {
      const v = prev.filter((c) => c.track === 'V1')
      const others = prev.filter((c) => c.track !== 'V1')
      const idx = v.findIndex((c) => c.id === selected.id)
      const j = idx + dir
      if (idx < 0 || j < 0 || j >= v.length) return prev
      const next = [...v]
      const tmp = next[idx]!
      next[idx] = next[j]!
      next[j] = tmp
      let cursor = 0
      const reflow = next.map((c) => {
        const start = cursor
        cursor += clipLen(c)
        return { ...c, startSec: start }
      })
      return [...reflow, ...others]
    })
  }

  const exportTimeline = (): void => {
    void onBusy(async () => {
      const v = clips.filter((c) => c.track === 'V1')
      if (v.length < 1) {
        onError(t('tools.video.multiNeedVideo'))
        return
      }
      const res = await window.treasureChest.renderMultiTrackVideo({
        width,
        height,
        fps: 30,
        muteVideoAudio,
        clips: clips.map((c) => ({
          path: c.path,
          kind: c.kind,
          track: c.track,
          inSec: c.inSec,
          outSec: c.outSec,
          startSec: c.startSec,
          volume: c.volume,
        })),
      })
      if (!res.ok) {
        if (res.error !== 'cancelled') onError(res.error || t('tools.video.multiFailed'))
        return
      }
      onMessage(t('tools.video.multiDone', { path: res.path }))
    })
  }

  const tracks: TrackId[] = ['V1', 'A1', 'OV1']

  return (
    <div className={styles.layout}>
      <section className={styles.stage}>
        <div className={styles.multiHead}>
          <h2 className={styles.panelTitle}>{t('tools.video.tab.timeline')}</h2>
          <p className={styles.hint}>{t('tools.video.multiHint')}</p>
          <div className={styles.actionRow}>
            <button type="button" className={styles.btnGhost} disabled={busy} onClick={addVideoClips}>
              {t('tools.video.multiAddVideo')}
            </button>
            <button type="button" className={styles.btnGhost} disabled={busy} onClick={addAudioClip}>
              {t('tools.video.multiAddAudio')}
            </button>
            <button type="button" className={styles.btnGhost} disabled={busy} onClick={addOverlay}>
              {t('tools.video.multiAddOverlay')}
            </button>
          </div>
        </div>

        <div className={styles.multiBoard} style={{ ['--px-per-sec' as string]: `${pxPerSec}px` }}>
          {tracks.map((track) => (
            <div key={track} className={styles.multiLane}>
              <div className={styles.multiLaneLabel}>
                {track === 'V1'
                  ? t('tools.video.multiTrackV')
                  : track === 'A1'
                    ? t('tools.video.multiTrackA')
                    : t('tools.video.multiTrackO')}
              </div>
              <div className={styles.multiLaneTrack} style={{ minWidth: totalDur * pxPerSec + 40 }}>
                {clips
                  .filter((c) => c.track === track)
                  .map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={`${styles.multiClip} ${selectedId === c.id ? styles.multiClipActive : ''} ${styles[`multiClip_${track}`]}`}
                      style={{
                        left: c.startSec * pxPerSec,
                        width: Math.max(36, clipLen(c) * pxPerSec),
                      }}
                      onClick={() => setSelectedId(c.id)}
                      title={c.name}
                    >
                      <span className={styles.multiClipName}>{c.name}</span>
                      <span className={styles.multiClipDur}>{clipLen(c).toFixed(1)}s</span>
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <aside className={styles.panel}>
        <div className={styles.panelHead}>
          <h2 className={styles.panelTitle}>{t('tools.video.multiInspector')}</h2>
        </div>
        <div className={styles.panelBody}>
          {selected ? (
            <>
              <p className={styles.hint}>{selected.name}</p>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>{t('tools.video.multiIn')}</span>
                <input
                  className={styles.input}
                  type="number"
                  min={0}
                  step={0.1}
                  value={selected.inSec}
                  disabled={busy || selected.kind === 'image'}
                  onChange={(e) => patchSelected({ inSec: Number(e.target.value) || 0 })}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>{t('tools.video.multiOut')}</span>
                <input
                  className={styles.input}
                  type="number"
                  min={0}
                  step={0.1}
                  value={selected.outSec}
                  disabled={busy || selected.kind === 'image'}
                  onChange={(e) => patchSelected({ outSec: Number(e.target.value) || 0 })}
                />
              </label>
              {selected.track !== 'V1' ? (
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>{t('tools.video.multiStart')}</span>
                  <input
                    className={styles.input}
                    type="number"
                    min={0}
                    step={0.1}
                    value={selected.startSec}
                    disabled={busy}
                    onChange={(e) => patchSelected({ startSec: Number(e.target.value) || 0 })}
                  />
                </label>
              ) : (
                <div className={styles.actionRow}>
                  <button type="button" className={styles.btnGhost} disabled={busy} onClick={() => moveV1(-1)}>
                    {t('tools.video.multiMoveLeft')}
                  </button>
                  <button type="button" className={styles.btnGhost} disabled={busy} onClick={() => moveV1(1)}>
                    {t('tools.video.multiMoveRight')}
                  </button>
                </div>
              )}
              {selected.track === 'A1' ? (
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>{t('tools.video.volume')}</span>
                  <input
                    className={styles.range}
                    type="range"
                    min={0}
                    max={2}
                    step={0.05}
                    value={selected.volume}
                    disabled={busy}
                    onChange={(e) => patchSelected({ volume: Number(e.target.value) })}
                  />
                </label>
              ) : null}
              <button type="button" className={styles.btnGhostBlock} disabled={busy} onClick={removeSelected}>
                {t('tools.video.multiRemove')}
              </button>
            </>
          ) : (
            <p className={styles.hint}>{t('tools.video.multiSelectHint')}</p>
          )}

          <label className={styles.field}>
            <span className={styles.fieldLabel}>{t('tools.video.multiWidth')}</span>
            <input
              className={styles.input}
              type="number"
              min={320}
              step={2}
              value={width}
              disabled={busy}
              onChange={(e) => setWidth(Number(e.target.value) || 1280)}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>{t('tools.video.multiHeight')}</span>
            <input
              className={styles.input}
              type="number"
              min={180}
              step={2}
              value={height}
              disabled={busy}
              onChange={(e) => setHeight(Number(e.target.value) || 720)}
            />
          </label>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={muteVideoAudio}
              disabled={busy}
              onChange={(e) => setMuteVideoAudio(e.target.checked)}
            />
            <span>{t('tools.video.multiMuteVideo')}</span>
          </label>
          <button
            type="button"
            className={styles.btnPrimaryBlock}
            disabled={busy || ffmpegOk === false || clips.every((c) => c.track !== 'V1')}
            onClick={exportTimeline}
          >
            {t('tools.video.multiExport')}
          </button>
        </div>
      </aside>
    </div>
  )
}

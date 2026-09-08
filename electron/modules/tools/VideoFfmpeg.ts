import { createRequire } from 'node:module'
import { basename, dirname, extname, join } from 'node:path'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { app, BrowserWindow, dialog } from 'electron'
import { logger } from '../../utils/logger'

const require = createRequire(import.meta.url)

export type VideoExportFormat = 'mp4' | 'webm' | 'mov' | 'gif' | 'mp3' | 'wav'
export type AudioExportFormat = 'mp3' | 'wav' | 'aac' | 'm4a' | 'ogg' | 'flac'

export interface VideoProbeInfo {
  ok: boolean
  duration?: number
  width?: number
  height?: number
  videoCodec?: string
  audioCodec?: string
  bitrate?: number
  sampleRate?: number
  channels?: number
  error?: string
}

export interface VideoProcessResult {
  ok: boolean
  path?: string
  error?: string
}

function unpackAsarPath(p: string): string {
  return p.replace('app.asar', 'app.asar.unpacked')
}

function resolveBinary(modName: 'ffmpeg-static' | 'ffprobe-static'): string {
  try {
    if (modName === 'ffmpeg-static') {
      const p = require('ffmpeg-static') as string | null
      if (!p) throw new Error('ffmpeg-static path empty')
      return unpackAsarPath(p)
    }
    const mod = require('ffprobe-static') as { path: string }
    if (!mod?.path) throw new Error('ffprobe-static path empty')
    return unpackAsarPath(mod.path)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`FFmpeg binary missing (${modName}): ${msg}`)
  }
}

function ffmpegBin(): string {
  return resolveBinary('ffmpeg-static')
}

/** Absolute path to bundled ffmpeg (for other tools, e.g. PDF image recompress). */
export function getFfmpegBinary(): string {
  return ffmpegBin()
}

function ffprobeBin(): string {
  return resolveBinary('ffprobe-static')
}

export function checkFfmpegAvailable(): {
  ok: boolean
  ffmpeg?: string
  ffprobe?: string
  error?: string
} {
  try {
    const ffmpeg = ffmpegBin()
    const ffprobe = ffprobeBin()
    if (!existsSync(ffmpeg)) return { ok: false, error: `ffmpeg not found: ${ffmpeg}` }
    if (!existsSync(ffprobe)) return { ok: false, error: `ffprobe not found: ${ffprobe}` }
    return { ok: true, ffmpeg, ffprobe }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

const localMediaMap = new Map<string, string>()
let localMediaServer: Server | null = null
let localMediaPort = 0
let localMediaStarting: Promise<number> | null = null

function mimeForPath(filePath: string): string {
  const ext = extname(filePath).toLowerCase()
  if (ext === '.webm') return 'video/webm'
  if (ext === '.mov') return 'video/quicktime'
  if (ext === '.mkv') return 'video/x-matroska'
  if (ext === '.avi') return 'video/x-msvideo'
  if (ext === '.mp3') return 'audio/mpeg'
  if (ext === '.wav') return 'audio/wav'
  if (ext === '.aac') return 'audio/aac'
  if (ext === '.m4a') return 'audio/mp4'
  if (ext === '.ogg' || ext === '.oga') return 'audio/ogg'
  if (ext === '.flac') return 'audio/flac'
  if (ext === '.gif') return 'image/gif'
  return 'video/mp4'
}

export async function ensureLocalMediaServer(): Promise<number> {
  if (localMediaServer && localMediaPort) return localMediaPort
  if (localMediaStarting) return localMediaStarting
  localMediaStarting = new Promise<number>((resolve, reject) => {
    const server = createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
      if (req.method === 'OPTIONS') {
        res.writeHead(204)
        res.end()
        return
      }
      try {
        const id = decodeURIComponent((req.url || '/').split('?')[0] || '/').replace(/^\/+/, '')
        const filePath = localMediaMap.get(id)
        if (!id || !filePath || !existsSync(filePath)) {
          res.writeHead(404)
          res.end('not found')
          return
        }
        const st = statSync(filePath)
        const mime = mimeForPath(filePath)
        const range = req.headers.range
        if (range) {
          const m = /bytes=(\d+)-(\d*)/.exec(range)
          if (m) {
            const start = Number(m[1])
            const end = m[2] ? Number(m[2]) : st.size - 1
            res.writeHead(206, {
              'Content-Range': `bytes ${start}-${end}/${st.size}`,
              'Accept-Ranges': 'bytes',
              'Content-Length': String(end - start + 1),
              'Content-Type': mime,
            })
            createReadStream(filePath, { start, end }).pipe(res)
            return
          }
        }
        res.writeHead(200, {
          'Content-Type': mime,
          'Content-Length': String(st.size),
          'Accept-Ranges': 'bytes',
        })
        createReadStream(filePath).pipe(res)
      } catch {
        res.writeHead(500)
        res.end('error')
      }
    })
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') {
        reject(new Error('local media server failed'))
        return
      }
      localMediaServer = server
      localMediaPort = addr.port
      localMediaStarting = null
      logger.info(`local video media http listening on http://127.0.0.1:${localMediaPort}`)
      resolve(localMediaPort)
    })
    server.on('error', reject)
  })
  return localMediaStarting
}

export async function registerLocalMediaPreview(filePath: string): Promise<string> {
  const port = await ensureLocalMediaServer()
  const id = randomUUID()
  localMediaMap.set(id, filePath)
  return `http://127.0.0.1:${port}/${id}`
}

function runProcess(
  bin: string,
  args: string[],
  onProgress?: (ratio: number) => void,
  durationHintSec?: number,
): Promise<{ code: number; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(bin, args, { windowsHide: true })
    let stderr = ''
    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stderr += text
      if (!onProgress || !durationHintSec || durationHintSec <= 0) return
      const m = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(text)
      if (!m) return
      const sec = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])
      onProgress(Math.min(0.99, Math.max(0, sec / durationHintSec)))
    })
    child.on('error', reject)
    child.on('close', (code) => resolvePromise({ code: code ?? 1, stderr }))
  })
}

function emitProgress(ratio: number, label: string): void {
  const payload = { ratio: Math.min(1, Math.max(0, ratio)), label }
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('videoTools:progress', payload)
    win.webContents.send('audioTools:progress', payload)
  }
}

export async function pickVideoFile(): Promise<string | null> {
  const win = BrowserWindow.getFocusedWindow()
  const opts: Electron.OpenDialogOptions = {
    properties: ['openFile'],
    filters: [
      { name: 'Video', extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v', 'flv', 'wmv'] },
    ],
  }
  const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
  if (result.canceled || !result.filePaths[0]) return null
  return result.filePaths[0]
}

export async function importVideoBuffer(payload: {
  fileName: string
  dataBase64: string
}): Promise<{ ok: boolean; path?: string; error?: string }> {
  try {
    const buf = Buffer.from(payload.dataBase64, 'base64')
    if (!buf.byteLength) return { ok: false, error: 'empty file' }
    const dir = join(app.getPath('temp'), 'treasure-chest-video')
    await mkdir(dir, { recursive: true })
    const safe = basename(payload.fileName).replace(/[^\w.\-()+ ]+/g, '_') || 'input.mp4'
    const path = join(dir, `${Date.now()}-${safe}`)
    await writeFile(path, buf)
    return { ok: true, path }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function probeVideo(filePath: string): Promise<VideoProbeInfo> {
  try {
    const out = await new Promise<string>((resolveOut, reject) => {
      const child = spawn(
        ffprobeBin(),
        ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', filePath],
        { windowsHide: true },
      )
      let stdout = ''
      let err = ''
      child.stdout.on('data', (c: Buffer) => {
        stdout += c.toString()
      })
      child.stderr.on('data', (c: Buffer) => {
        err += c.toString()
      })
      child.on('error', reject)
      child.on('close', (c) => {
        if (c !== 0) reject(new Error(err || `ffprobe exit ${c}`))
        else resolveOut(stdout)
      })
    })
    const data = JSON.parse(out) as {
      format?: { duration?: string; bit_rate?: string }
      streams?: Array<{
        codec_type?: string
        codec_name?: string
        width?: number
        height?: number
        sample_rate?: string
        channels?: number
      }>
    }
    const video = data.streams?.find((s) => s.codec_type === 'video')
    const audio = data.streams?.find((s) => s.codec_type === 'audio')
    return {
      ok: true,
      duration: Number(data.format?.duration || 0) || undefined,
      width: video?.width,
      height: video?.height,
      videoCodec: video?.codec_name,
      audioCodec: audio?.codec_name,
      bitrate: Number(data.format?.bit_rate || 0) || undefined,
      sampleRate: audio?.sample_rate ? Number(audio.sample_rate) || undefined : undefined,
      channels: audio?.channels,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.warn(`ffprobe failed: ${msg}`)
    return { ok: false, error: msg }
  }
}

function defaultOutPath(inputPath: string, suffix: string, ext: string): string {
  const dir = dirname(inputPath)
  const base = basename(inputPath, extname(inputPath))
  return join(dir, `${base}${suffix}.${ext}`)
}

async function chooseOutputPath(defaultPath: string, extensions: string[]): Promise<string | null> {
  const win = BrowserWindow.getFocusedWindow()
  const opts: Electron.SaveDialogOptions = {
    defaultPath,
    filters: [{ name: 'Media', extensions }],
  }
  const result = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
  if (result.canceled || !result.filePath) return null
  return result.filePath
}

function formatArgs(format: VideoExportFormat): { ext: string; args: string[] } {
  switch (format) {
    case 'webm':
      return {
        ext: 'webm',
        args: ['-c:v', 'libvpx-vp9', '-b:v', '1M', '-c:a', 'libopus'],
      }
    case 'mov':
      return {
        ext: 'mov',
        args: ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart'],
      }
    case 'gif':
      return {
        ext: 'gif',
        args: [
          '-vf',
          'fps=12,scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse',
          '-an',
        ],
      }
    case 'mp3':
      return { ext: 'mp3', args: ['-vn', '-c:a', 'libmp3lame', '-q:a', '2'] }
    case 'wav':
      return { ext: 'wav', args: ['-vn', '-c:a', 'pcm_s16le'] }
    case 'mp4':
    default:
      return {
        ext: 'mp4',
        args: ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart'],
      }
  }
}

export async function processVideo(payload: {
  inputPath: string
  startSec?: number
  endSec?: number
  mute?: boolean
  format: VideoExportFormat
  maxEdge?: number
  /** Playback speed, e.g. 0.5 / 1 / 1.5 / 2 */
  speed?: number
  /** 0 | 90 | 180 | 270 clockwise */
  rotateDeg?: 0 | 90 | 180 | 270
  watermarkText?: string
  watermarkPosition?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center'
  /** PNG/JPG overlay watermark */
  watermarkImagePath?: string
  /** Relative scale of image watermark vs video width (0.05–0.5) */
  watermarkImageScale?: number
  /** SRT / ASS subtitle file to burn in */
  subtitlePath?: string
  /** Subtitle font size (default 20) */
  subtitleFontSize?: number
  /** ASS PrimaryColour like &H00FFFFFF& (white) — optional hex #RRGGBB */
  subtitleColor?: string
  /** Video color grade: brightness/contrast/saturation (0–2, 1=neutral) */
  brightness?: number
  contrast?: number
  saturation?: number
  /** Linear volume gain (1 = unchanged) */
  volume?: number
  /** Fade-in duration in seconds */
  fadeInSec?: number
  /** Fade-out duration in seconds */
  fadeOutSec?: number
}): Promise<VideoProcessResult> {
  const check = checkFfmpegAvailable()
  if (!check.ok) return { ok: false, error: check.error || 'ffmpeg unavailable' }

  const inputPath = payload.inputPath
  if (!inputPath || !existsSync(inputPath)) return { ok: false, error: 'input missing' }

  const { ext, args: codecArgs } = formatArgs(payload.format)
  const start = Math.max(0, payload.startSec ?? 0)
  const end = payload.endSec
  const duration = end != null && end > start ? end - start : undefined
  const speed = payload.speed && payload.speed > 0 ? payload.speed : 1
  const rotate = payload.rotateDeg ?? 0
  const wm = payload.watermarkText?.trim() || ''
  const wmImg =
    payload.watermarkImagePath && existsSync(payload.watermarkImagePath)
      ? payload.watermarkImagePath
      : ''
  const subPath =
    payload.subtitlePath && existsSync(payload.subtitlePath) ? payload.subtitlePath : ''
  const wmScale = Math.min(0.5, Math.max(0.05, payload.watermarkImageScale ?? 0.18))
  const bright = clampGrade(payload.brightness, 1)
  const contrast = clampGrade(payload.contrast, 1)
  const sat = clampGrade(payload.saturation, 1)
  const hasGrade = bright !== 1 || contrast !== 1 || sat !== 1
  const probedDur =
    duration ??
    (payload.fadeOutSec || payload.fadeInSec ? (await probeVideo(inputPath)).duration : undefined)

  const outDefault = defaultOutPath(
    inputPath,
    duration != null ||
      start > 0 ||
      speed !== 1 ||
      rotate ||
      wm ||
      wmImg ||
      subPath ||
      hasGrade
      ? `-edit`
      : `-export`,
    ext,
  )
  const outPath = await chooseOutputPath(outDefault, [ext])
  if (!outPath) return { ok: false, error: 'cancelled' }

  const args: string[] = ['-y', '-hide_banner']
  if (start > 0) args.push('-ss', String(start))
  args.push('-i', inputPath)
  if (wmImg) args.push('-i', wmImg)
  if (duration != null) args.push('-t', String(duration))

  const isGif = payload.format === 'gif'
  const isAudioOnly = payload.format === 'mp3' || payload.format === 'wav'
  const useComplex = Boolean(wmImg && !isGif && !isAudioOnly)

  const baseFilters: string[] = []
  if (payload.maxEdge && payload.maxEdge > 0 && !isGif) {
    const e = Math.floor(payload.maxEdge)
    baseFilters.push(`scale='min(${e},iw)':'min(${e},ih)':force_original_aspect_ratio=decrease`)
  }
  if (rotate === 90) baseFilters.push('transpose=1')
  else if (rotate === 180) baseFilters.push('transpose=1,transpose=1')
  else if (rotate === 270) baseFilters.push('transpose=2')
  if (speed !== 1 && !isGif) baseFilters.push(`setpts=${(1 / speed).toFixed(6)}*PTS`)
  if (hasGrade && !isGif && !isAudioOnly) {
    // eq brightness is additive around 0; map 1→0, 1.2→0.2, 0.8→-0.2
    const b = (bright - 1).toFixed(3)
    baseFilters.push(`eq=brightness=${b}:contrast=${contrast.toFixed(3)}:saturation=${sat.toFixed(3)}`)
  }

  const pos = payload.watermarkPosition || 'bottom-right'
  if (wm && !isGif && !isAudioOnly) {
    const escaped = escapeDrawText(wm)
    baseFilters.push(
      `drawtext=text='${escaped}':fontsize=28:fontcolor=white@0.65:borderw=2:bordercolor=black@0.45:${watermarkXy(pos)}`,
    )
  }
  if (subPath && !isGif && !isAudioOnly) {
    const fontSize = Math.min(72, Math.max(12, Math.round(payload.subtitleFontSize || 20)))
    const primary = hexToAssPrimary(payload.subtitleColor || '#FFFFFF')
    const style = `FontSize=${fontSize},PrimaryColour=${primary},Outline=2,Shadow=1,BorderStyle=1`
    baseFilters.push(
      `subtitles=${escapeSubtitlePath(subPath)}:force_style='${style}'`,
    )
  }

  if (useComplex) {
    const chain = baseFilters.length ? baseFilters.join(',') : 'null'
    const overlay = overlayXy(pos)
    const filter = `[0:v]${chain}[base];[1:v]scale=iw*${wmScale}:-1[wm];[base][wm]overlay=${overlay}[vout]`
    args.push('-filter_complex', filter, '-map', '[vout]', '-map', '0:a?')
  } else if (!isGif && baseFilters.length) {
    args.push('-vf', baseFilters.join(','))
  }

  const af: string[] = []
  if (speed !== 1 && !payload.mute && !isAudioOnly && !isGif) {
    af.push(...atempoChain(speed))
  }
  if (!payload.mute && !isGif) {
    af.push(
      ...buildAudioFx({
        volume: payload.volume,
        fadeInSec: payload.fadeInSec,
        fadeOutSec: payload.fadeOutSec,
        totalSec: probedDur,
      }),
    )
  }

  args.push(...codecArgs)
  if (af.length) args.push('-af', af.join(','))
  if (payload.mute && !isAudioOnly && !isGif) args.push('-an')
  args.push(outPath)

  const baseDur = probedDur ?? duration ?? (await probeVideo(inputPath)).duration ?? undefined
  const workDuration = baseDur != null && speed !== 1 ? baseDur / speed : baseDur

  emitProgress(0.01, 'start')
  try {
    const { code, stderr } = await runProcess(
      ffmpegBin(),
      args,
      (r) => emitProgress(r, 'encode'),
      workDuration,
    )
    if (code !== 0) {
      logger.warn(`ffmpeg failed: ${stderr.slice(-400)}`)
      return { ok: false, error: stderr.slice(-240) || `ffmpeg exit ${code}` }
    }
    emitProgress(1, 'done')
    return { ok: true, path: outPath }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

function clampGrade(v: number | undefined, fallback: number): number {
  if (v == null || !Number.isFinite(v)) return fallback
  return Math.min(2, Math.max(0.2, v))
}

/** Convert #RRGGBB to ASS PrimaryColour &HAABBGGRR& */
function hexToAssPrimary(hex: string): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim())
  if (!m) return '&H00FFFFFF'
  const r = m[1].slice(0, 2)
  const g = m[1].slice(2, 4)
  const b = m[1].slice(4, 6)
  return `&H00${b}${g}${r}`.toUpperCase()
}

function escapeDrawText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/%/g, '\\%')
    .slice(0, 120)
}

function escapeSubtitlePath(p: string): string {
  // ffmpeg subtitles filter: escape \ : ' and wrap path
  const escaped = p.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'")
  return `'${escaped}'`
}

function watermarkXy(
  pos: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center',
): string {
  switch (pos) {
    case 'top-left':
      return 'x=24:y=24'
    case 'top-right':
      return 'x=w-tw-24:y=24'
    case 'bottom-left':
      return 'x=24:y=h-th-24'
    case 'center':
      return 'x=(w-tw)/2:y=(h-th)/2'
    case 'bottom-right':
    default:
      return 'x=w-tw-24:y=h-th-24'
  }
}

function overlayXy(
  pos: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center',
): string {
  switch (pos) {
    case 'top-left':
      return '24:24'
    case 'top-right':
      return 'W-w-24:24'
    case 'bottom-left':
      return '24:H-h-24'
    case 'center':
      return '(W-w)/2:(H-h)/2'
    case 'bottom-right':
    default:
      return 'W-w-24:H-h-24'
  }
}

/** atempo only accepts 0.5–2.0; chain for other speeds. */
function atempoChain(speed: number): string[] {
  const filters: string[] = []
  let s = speed
  while (s > 2.0001) {
    filters.push('atempo=2.0')
    s /= 2
  }
  while (s < 0.4999) {
    filters.push('atempo=0.5')
    s /= 0.5
  }
  filters.push(`atempo=${s.toFixed(4)}`)
  return filters
}

function buildAudioFx(opts: {
  volume?: number
  fadeInSec?: number
  fadeOutSec?: number
  totalSec?: number
  normalize?: boolean
}): string[] {
  const filters: string[] = []
  const vol = opts.volume != null && Number.isFinite(opts.volume) ? opts.volume : 1
  if (Math.abs(vol - 1) > 0.001) {
    filters.push(`volume=${Math.min(4, Math.max(0, vol)).toFixed(3)}`)
  }
  const fadeIn = Math.max(0, opts.fadeInSec ?? 0)
  const fadeOut = Math.max(0, opts.fadeOutSec ?? 0)
  if (fadeIn > 0) filters.push(`afade=t=in:st=0:d=${fadeIn.toFixed(3)}`)
  if (fadeOut > 0 && opts.totalSec != null && opts.totalSec > fadeOut) {
    const st = Math.max(0, opts.totalSec - fadeOut)
    filters.push(`afade=t=out:st=${st.toFixed(3)}:d=${fadeOut.toFixed(3)}`)
  }
  if (opts.normalize) filters.push('loudnorm=I=-16:TP=-1.5:LRA=11')
  return filters
}

function audioFormatArgs(format: AudioExportFormat): { ext: string; args: string[] } {
  switch (format) {
    case 'wav':
      return { ext: 'wav', args: ['-vn', '-c:a', 'pcm_s16le'] }
    case 'aac':
      return { ext: 'aac', args: ['-vn', '-c:a', 'aac', '-b:a', '192k'] }
    case 'm4a':
      return { ext: 'm4a', args: ['-vn', '-c:a', 'aac', '-b:a', '192k'] }
    case 'ogg':
      return { ext: 'ogg', args: ['-vn', '-c:a', 'libvorbis', '-q:a', '5'] }
    case 'flac':
      return { ext: 'flac', args: ['-vn', '-c:a', 'flac'] }
    case 'mp3':
    default:
      return { ext: 'mp3', args: ['-vn', '-c:a', 'libmp3lame', '-q:a', '2'] }
  }
}

export async function pickAudioMediaFile(): Promise<string | null> {
  const win = BrowserWindow.getFocusedWindow()
  const opts: Electron.OpenDialogOptions = {
    properties: ['openFile'],
    filters: [
      {
        name: 'Audio / Video',
        extensions: [
          'mp3',
          'wav',
          'aac',
          'm4a',
          'ogg',
          'flac',
          'wma',
          'mp4',
          'mov',
          'mkv',
          'webm',
          'm4v',
        ],
      },
    ],
  }
  const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
  if (result.canceled || !result.filePaths[0]) return null
  return result.filePaths[0]
}

export async function importAudioBuffer(payload: {
  fileName: string
  dataBase64: string
}): Promise<{ ok: boolean; path?: string; error?: string }> {
  try {
    const buf = Buffer.from(payload.dataBase64, 'base64')
    if (!buf.byteLength) return { ok: false, error: 'empty file' }
    const dir = join(app.getPath('temp'), 'treasure-chest-audio')
    await mkdir(dir, { recursive: true })
    const safe = basename(payload.fileName).replace(/[^\w.\-()+ ]+/g, '_') || 'input.mp3'
    const path = join(dir, `${Date.now()}-${safe}`)
    await writeFile(path, buf)
    return { ok: true, path }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Trim / convert / volume / fade / normalize / speed for audio (or extract from video). */
export async function processAudio(payload: {
  inputPath: string
  startSec?: number
  endSec?: number
  format: AudioExportFormat
  volume?: number
  fadeInSec?: number
  fadeOutSec?: number
  normalize?: boolean
  speed?: number
}): Promise<VideoProcessResult> {
  const check = checkFfmpegAvailable()
  if (!check.ok) return { ok: false, error: check.error || 'ffmpeg unavailable' }
  const inputPath = payload.inputPath
  if (!inputPath || !existsSync(inputPath)) return { ok: false, error: 'input missing' }

  const { ext, args: codecArgs } = audioFormatArgs(payload.format)
  const start = Math.max(0, payload.startSec ?? 0)
  const end = payload.endSec
  const duration = end != null && end > start ? end - start : undefined
  const speed = payload.speed && payload.speed > 0 ? payload.speed : 1
  const probed = await probeVideo(inputPath)
  const totalForFade = duration ?? probed.duration

  const outPath = await chooseOutputPath(defaultOutPath(inputPath, '-audio', ext), [ext])
  if (!outPath) return { ok: false, error: 'cancelled' }

  const args: string[] = ['-y', '-hide_banner']
  if (start > 0) args.push('-ss', String(start))
  args.push('-i', inputPath)
  if (duration != null) args.push('-t', String(duration))

  const af: string[] = []
  if (speed !== 1) af.push(...atempoChain(speed))
  af.push(
    ...buildAudioFx({
      volume: payload.volume,
      fadeInSec: payload.fadeInSec,
      fadeOutSec: payload.fadeOutSec,
      totalSec: totalForFade != null && speed !== 1 ? totalForFade / speed : totalForFade,
      normalize: payload.normalize,
    }),
  )
  if (af.length) args.push('-af', af.join(','))
  args.push(...codecArgs, outPath)

  const workDuration =
    totalForFade != null && speed !== 1 ? totalForFade / speed : totalForFade ?? undefined
  emitProgress(0.01, 'start')
  try {
    const { code, stderr } = await runProcess(
      ffmpegBin(),
      args,
      (r) => emitProgress(r, 'encode'),
      workDuration,
    )
    if (code !== 0) {
      logger.warn(`ffmpeg audio failed: ${stderr.slice(-400)}`)
      return { ok: false, error: stderr.slice(-240) || `ffmpeg exit ${code}` }
    }
    emitProgress(1, 'done')
    return { ok: true, path: outPath }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function pickAudioMediaFiles(): Promise<string[]> {
  const win = BrowserWindow.getFocusedWindow()
  const opts: Electron.OpenDialogOptions = {
    properties: ['openFile', 'multiSelections'],
    filters: [
      {
        name: 'Audio',
        extensions: ['mp3', 'wav', 'aac', 'm4a', 'ogg', 'flac', 'wma'],
      },
    ],
  }
  const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
  if (result.canceled) return []
  return result.filePaths
}

/** Concat multiple audio files into one (re-encode). */
export async function concatAudios(payload?: {
  inputPaths?: string[]
  format?: AudioExportFormat
}): Promise<VideoProcessResult> {
  const check = checkFfmpegAvailable()
  if (!check.ok) return { ok: false, error: check.error || 'ffmpeg unavailable' }
  let paths = (payload?.inputPaths || []).filter((p) => p && existsSync(p))
  if (paths.length < 2) paths = await pickAudioMediaFiles()
  if (paths.length < 2) return { ok: false, error: 'need at least 2 audio files' }

  const format = payload?.format || 'mp3'
  const { ext, args: codecArgs } = audioFormatArgs(format)
  const outPath = await chooseOutputPath(defaultOutPath(paths[0]!, '-concat', ext), [ext])
  if (!outPath) return { ok: false, error: 'cancelled' }

  const listPath = join(app.getPath('temp'), `treasure-audio-concat-${Date.now()}.txt`)
  const listBody = paths.map((p) => `file '${p.replace(/'/g, `'\\''`)}'`).join('\n')
  await writeFile(listPath, listBody, 'utf8')

  const args = [
    '-y',
    '-hide_banner',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    listPath,
    ...codecArgs,
    outPath,
  ]

  emitProgress(0.01, 'concat')
  try {
    let total = 0
    for (const p of paths) total += (await probeVideo(p)).duration || 0
    const { code, stderr } = await runProcess(
      ffmpegBin(),
      args,
      (r) => emitProgress(r, 'concat'),
      total,
    )
    await unlink(listPath).catch(() => undefined)
    if (code !== 0) {
      logger.warn(`ffmpeg audio concat failed: ${stderr.slice(-400)}`)
      return { ok: false, error: stderr.slice(-240) || `ffmpeg exit ${code}` }
    }
    emitProgress(1, 'done')
    return { ok: true, path: outPath }
  } catch (err) {
    await unlink(listPath).catch(() => undefined)
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function pickImageFile(): Promise<string | null> {
  const win = BrowserWindow.getFocusedWindow()
  const opts: Electron.OpenDialogOptions = {
    properties: ['openFile'],
    filters: [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }],
  }
  const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
  if (result.canceled || !result.filePaths[0]) return null
  return result.filePaths[0]
}

export async function pickSubtitleFile(): Promise<string | null> {
  const win = BrowserWindow.getFocusedWindow()
  const opts: Electron.OpenDialogOptions = {
    properties: ['openFile'],
    filters: [{ name: 'Subtitles', extensions: ['srt', 'ass', 'ssa', 'vtt'] }],
  }
  const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
  if (result.canceled || !result.filePaths[0]) return null
  return result.filePaths[0]
}

export async function pickVideoFiles(): Promise<string[]> {
  const win = BrowserWindow.getFocusedWindow()
  const opts: Electron.OpenDialogOptions = {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Video', extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v', 'flv', 'wmv'] },
    ],
  }
  const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
  if (result.canceled) return []
  return result.filePaths
}

/** Concat multiple videos into one MP4 (re-encode for compatibility). */
export async function concatVideos(payload?: {
  inputPaths?: string[]
}): Promise<VideoProcessResult> {
  const check = checkFfmpegAvailable()
  if (!check.ok) return { ok: false, error: check.error || 'ffmpeg unavailable' }
  let paths = (payload?.inputPaths || []).filter((p) => p && existsSync(p))
  if (paths.length < 2) {
    paths = await pickVideoFiles()
  }
  if (paths.length < 2) return { ok: false, error: 'need at least 2 videos' }

  const outPath = await chooseOutputPath(
    defaultOutPath(paths[0], '-concat', 'mp4'),
    ['mp4'],
  )
  if (!outPath) return { ok: false, error: 'cancelled' }

  const listPath = join(app.getPath('temp'), `treasure-concat-${Date.now()}.txt`)
  const listBody = paths.map((p) => `file '${p.replace(/'/g, `'\\''`)}'`).join('\n')
  await writeFile(listPath, listBody, 'utf8')

  const args = [
    '-y',
    '-hide_banner',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    listPath,
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-movflags',
    '+faststart',
    outPath,
  ]

  emitProgress(0.01, 'concat')
  try {
    let total = 0
    for (const p of paths) {
      total += (await probeVideo(p)).duration || 0
    }
    const { code, stderr } = await runProcess(ffmpegBin(), args, (r) => emitProgress(r, 'concat'), total)
    await unlink(listPath).catch(() => undefined)
    if (code !== 0) {
      logger.warn(`ffmpeg concat failed: ${stderr.slice(-400)}`)
      return { ok: false, error: stderr.slice(-240) || `ffmpeg exit ${code}` }
    }
    emitProgress(1, 'done')
    return { ok: true, path: outPath }
  } catch (err) {
    await unlink(listPath).catch(() => undefined)
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export type MultiTrackClipInput = {
  path: string
  kind: 'video' | 'audio' | 'image'
  track: 'V1' | 'A1' | 'OV1'
  /** Source in-point (seconds) */
  inSec?: number
  /** Source out-point (seconds); 0/omit = end of media */
  outSec?: number
  /** Timeline start (seconds). V1 uses order primarily; startSec used for A1/OV1. */
  startSec?: number
  volume?: number
}

async function normalizeVideoClip(opts: {
  input: string
  inSec: number
  outSec: number
  width: number
  height: number
  fps: number
  dest: string
}): Promise<{ ok: boolean; error?: string; duration: number }> {
  const dur = Math.max(0.05, opts.outSec - opts.inSec)
  const vf = [
    `scale=${opts.width}:${opts.height}:force_original_aspect_ratio=decrease`,
    `pad=${opts.width}:${opts.height}:(ow-iw)/2:(oh-ih)/2`,
    'setsar=1',
    `fps=${opts.fps}`,
  ].join(',')
  const args = [
    '-y',
    '-hide_banner',
    '-ss',
    String(opts.inSec),
    '-t',
    String(dur),
    '-i',
    opts.input,
    '-vf',
    vf,
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-ar',
    '44100',
    '-ac',
    '2',
    opts.dest,
  ]
  const { code, stderr } = await runProcess(ffmpegBin(), args, () => undefined, dur)
  if (code !== 0) return { ok: false, error: stderr.slice(-240) || `ffmpeg exit ${code}`, duration: 0 }
  return { ok: true, duration: dur }
}

/**
 * Multi-track compose:
 * - V1: video clips normalized + sequential concat
 * - A1: optional bed music mixed under (or replacing) video audio
 * - OV1: optional image overlay for a timed window
 */
export async function renderMultiTrack(payload: {
  clips: MultiTrackClipInput[]
  width?: number
  height?: number
  fps?: number
  muteVideoAudio?: boolean
}): Promise<VideoProcessResult> {
  const check = checkFfmpegAvailable()
  if (!check.ok) return { ok: false, error: check.error || 'ffmpeg unavailable' }

  const clips = (payload.clips || []).filter((c) => c.path && existsSync(c.path))
  const vClips = clips.filter((c) => c.track === 'V1' && c.kind === 'video')
  const aClips = clips.filter((c) => c.track === 'A1' && (c.kind === 'audio' || c.kind === 'video'))
  const oClips = clips.filter((c) => c.track === 'OV1' && c.kind === 'image')
  if (vClips.length < 1) return { ok: false, error: 'need_v1_clip' }

  const width = payload.width && payload.width > 0 ? payload.width : 1280
  const height = payload.height && payload.height > 0 ? payload.height : 720
  const fps = payload.fps && payload.fps > 0 ? payload.fps : 30

  const outPath = await chooseOutputPath(
    defaultOutPath(vClips[0]!.path, '-multitrack', 'mp4'),
    ['mp4'],
  )
  if (!outPath) return { ok: false, error: 'cancelled' }

  const workDir = join(app.getPath('temp'), `treasure-multitrack-${Date.now()}`)
  await mkdir(workDir, { recursive: true })
  const temps: string[] = []

  try {
    emitProgress(0.02, 'normalize')
    const normalized: string[] = []
    let totalDur = 0
    for (let i = 0; i < vClips.length; i++) {
      const clip = vClips[i]!
      const probe = await probeVideo(clip.path)
      const srcDur = probe.duration || 0
      const inSec = Math.max(0, clip.inSec ?? 0)
      let outSec = clip.outSec && clip.outSec > inSec ? clip.outSec : srcDur
      if (!outSec || outSec <= inSec) outSec = inSec + Math.max(srcDur - inSec, 1)
      const dest = join(workDir, `v${i}.mp4`)
      temps.push(dest)
      const res = await normalizeVideoClip({
        input: clip.path,
        inSec,
        outSec,
        width,
        height,
        fps,
        dest,
      })
      if (!res.ok) return { ok: false, error: res.error || 'normalize_failed' }
      normalized.push(dest)
      totalDur += res.duration
      emitProgress(0.05 + (0.45 * (i + 1)) / vClips.length, 'normalize')
    }

    let videoPath = normalized[0]!
    if (normalized.length > 1) {
      const listPath = join(workDir, 'list.txt')
      temps.push(listPath)
      await writeFile(
        listPath,
        normalized.map((p) => `file '${p.replace(/'/g, `'\\''`)}'`).join('\n'),
        'utf8',
      )
      const concatOut = join(workDir, 'concat.mp4')
      temps.push(concatOut)
      const concatArgs = [
        '-y',
        '-hide_banner',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        listPath,
        '-c',
        'copy',
        concatOut,
      ]
      const { code, stderr } = await runProcess(
        ffmpegBin(),
        concatArgs,
        (r) => emitProgress(0.5 + r * 0.15, 'concat'),
        totalDur,
      )
      if (code !== 0) return { ok: false, error: stderr.slice(-240) || `ffmpeg exit ${code}` }
      videoPath = concatOut
    }

    emitProgress(0.68, 'mix')
    const overlay = oClips[0]
    const bed = aClips[0]
    const inputs: string[] = ['-y', '-hide_banner', '-i', videoPath]
    const filterParts: string[] = []
    let mapV = '0:v'
    let mapA: string | null = payload.muteVideoAudio ? null : '0:a?'

    if (overlay) {
      inputs.push('-i', overlay.path)
      const ovIn = Math.max(0, overlay.startSec ?? 0)
      const ovDur =
        overlay.outSec && overlay.inSec != null && overlay.outSec > overlay.inSec
          ? overlay.outSec - overlay.inSec
          : totalDur
      const enable = `between(t\\,${ovIn}\\,${ovIn + Math.max(0.05, ovDur)})`
      filterParts.push(
        `[1:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,format=rgba[ov]`,
        `[0:v][ov]overlay=(W-w)/2:(H-h)/2:enable='${enable}'[vout]`,
      )
      mapV = '[vout]'
    }

    if (bed) {
      const bedIdx = overlay ? 2 : 1
      inputs.push('-i', bed.path)
      const vol = typeof bed.volume === 'number' && bed.volume > 0 ? bed.volume : 1
      const delayMs = Math.round(Math.max(0, bed.startSec ?? 0) * 1000)
      const bedIn = Math.max(0, bed.inSec ?? 0)
      const bedTrim =
        bed.outSec && bed.outSec > bedIn
          ? `,atrim=start=${bedIn}:end=${bed.outSec},asetpts=PTS-STARTPTS`
          : bedIn > 0
            ? `,atrim=start=${bedIn},asetpts=PTS-STARTPTS`
            : ''
      if (payload.muteVideoAudio || !mapA) {
        filterParts.push(
          `[${bedIdx}:a]aformat=sample_rates=44100:channel_layouts=stereo${bedTrim},adelay=${delayMs}|${delayMs},volume=${vol}[aout]`,
        )
        mapA = '[aout]'
      } else {
        filterParts.push(
          `[0:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=1[va]`,
          `[${bedIdx}:a]aformat=sample_rates=44100:channel_layouts=stereo${bedTrim},adelay=${delayMs}|${delayMs},volume=${vol}[ba]`,
          `[va][ba]amix=inputs=2:duration=first:dropout_transition=2[aout]`,
        )
        mapA = '[aout]'
      }
    }

    const finalArgs = [...inputs]
    if (filterParts.length) {
      finalArgs.push('-filter_complex', filterParts.join(';'))
      finalArgs.push('-map', mapV)
      if (mapA) finalArgs.push('-map', mapA)
      else finalArgs.push('-an')
    } else if (payload.muteVideoAudio) {
      finalArgs.push('-map', '0:v', '-an')
    } else {
      finalArgs.push('-map', '0:v', '-map', '0:a?')
    }
    finalArgs.push(
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-movflags',
      '+faststart',
      '-t',
      String(totalDur),
      outPath,
    )

    const { code, stderr } = await runProcess(
      ffmpegBin(),
      finalArgs,
      (r) => emitProgress(0.7 + r * 0.28, 'encode'),
      totalDur,
    )
    if (code !== 0) {
      logger.warn(`ffmpeg multitrack failed: ${stderr.slice(-400)}`)
      return { ok: false, error: stderr.slice(-240) || `ffmpeg exit ${code}` }
    }
    emitProgress(1, 'done')
    return { ok: true, path: outPath }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  } finally {
    for (const p of temps) {
      await unlink(p).catch(() => undefined)
    }
    try {
      const { rmSync } = await import('node:fs')
      rmSync(workDir, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  }
}

export async function cleanupTempVideo(path: string): Promise<void> {
  try {
    if (path.includes('treasure-chest-video')) await unlink(path)
  } catch {
    /* ignore */
  }
}

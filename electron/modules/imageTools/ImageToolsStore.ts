import { app, dialog, shell, BrowserWindow, net } from 'electron'
import {
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createServer, type Server } from 'node:http'
import { basename, dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import type {
  ImageSaveRequest,
  ImageSaveResult,
  ImageSmartRunRequest,
  ImageSmartRunResult,
  ImageToolsSettings,
  VisionInstallProgress,
  VisionModelState,
} from '@shared'
import {
  DEFAULT_IMAGE_TOOLS_SETTINGS,
  IpcChannels,
  parseImageToolsSettings,
  visionCatalogEntry,
  mergeVisionModelStates,
} from '@shared'
import { getSetting, setSetting } from '../../db/AppSettingsRepo'
import { logger } from '../../utils/logger'
import { appendActivity } from '../debug/ActivityLog'

const SETTINGS_KEY = 'imageTools'

function userDataModelsRoot(): string {
  return join(app.getPath('userData'), 'models', 'vision')
}

function ensureDir(dir: string): string {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/** Persistable slice — strip ephemeral resolvedModelsRoot. */
function persistable(settings: ImageToolsSettings): ImageToolsSettings {
  const { resolvedModelsRoot: _drop, ...rest } = settings
  return {
    ...rest,
    // Directory is fixed under userData; do not let old project/custom modes stick.
    modelsRootMode: 'userData',
    customModelsRoot: '',
  }
}

export function resolveModelsRoot(): string {
  return ensureDir(userDataModelsRoot())
}

function getPersisted(): ImageToolsSettings {
  const parsed = parseImageToolsSettings(getSetting(SETTINGS_KEY, DEFAULT_IMAGE_TOOLS_SETTINGS))
  return {
    ...parsed,
    modelsRootMode: 'userData',
    customModelsRoot: '',
  }
}

function modelsRoot(): string {
  return resolveModelsRoot()
}

function modelDir(id: string): string {
  return ensureDir(join(modelsRoot(), id))
}

function dirBytes(dir: string): number {
  if (!existsSync(dir)) return 0
  let total = 0
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isFile()) total += st.size
    else if (st.isDirectory()) total += dirBytes(p)
  }
  return total
}

function assetsPresent(id: string, dir: string): boolean {
  const entry = visionCatalogEntry(id)
  if (!entry) return false
  const assets = entry.downloadAssets ?? []
  if (assets.length === 0) {
    // IMG.LY-style: require resources.json from a real CDN install (not marker-only).
    return existsSync(join(dir, 'resources.json'))
  }
  return assets.every((asset) => {
    const p = join(dir, asset.fileName)
    if (!existsSync(p)) return false
    try {
      return statSync(p).size > 1024
    } catch {
      return false
    }
  })
}

function probeReady(id: string, state: VisionModelState): VisionModelState {
  const dir = join(modelsRoot(), id)
  const marker = join(dir, '.installed')
  // Marker alone is not enough — expected weight files must exist.
  if (existsSync(marker) && assetsPresent(id, dir)) {
    return {
      ...state,
      id,
      status: 'ready',
      path: dir,
      bytes: dirBytes(dir),
      error: undefined,
    }
  }
  if (state.status === 'installing' || state.status === 'error') {
    return { ...state, id, path: state.path ?? dir }
  }
  return { id, status: 'not_installed' }
}

export function getImageToolsSettings(): ImageToolsSettings {
  const parsed = getPersisted()
  const models = mergeVisionModelStates(parsed.models).map((m) => probeReady(m.id, m))
  return { ...parsed, models, resolvedModelsRoot: resolveModelsRoot() }
}

export function setImageToolsSettings(partial: Partial<ImageToolsSettings>): ImageToolsSettings {
  const cur = getImageToolsSettings()
  const next: ImageToolsSettings = {
    ...cur,
    ...partial,
    taskModelIds: partial.taskModelIds ? { ...cur.taskModelIds, ...partial.taskModelIds } : cur.taskModelIds,
    models: partial.models ? mergeVisionModelStates(partial.models) : cur.models,
    modelsRootMode: 'userData',
    customModelsRoot: '',
  }
  setSetting(SETTINGS_KEY, persistable(next))
  resolveModelsRoot()
  return getImageToolsSettings()
}

function markInstalled(id: string): VisionModelState {
  const dir = modelDir(id)
  writeFileSync(join(dir, '.installed'), String(Date.now()), 'utf8')
  const state: VisionModelState = {
    id,
    status: 'ready',
    path: dir,
    installedAt: Date.now(),
    bytes: dirBytes(dir),
  }
  const cur = getImageToolsSettings()
  const models = cur.models.map((m) => (m.id === id ? state : m))
  setSetting(SETTINGS_KEY, persistable({ ...cur, models }))
  return state
}

function markStatus(id: string, status: VisionModelState['status'], error?: string): VisionModelState {
  const cur = getImageToolsSettings()
  const models = cur.models.map((m) =>
    (m.id === id ? { ...m, status, error, path: m.path ?? join(modelsRoot(), id) } : m),
  )
  setSetting(SETTINGS_KEY, persistable({ ...cur, models }))
  return models.find((m) => m.id === id) ?? { id, status, error }
}

function emitInstallProgress(payload: VisionInstallProgress): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IpcChannels.imageTools.installProgress, payload)
  }
}

/** Maps one file's 0–1 fraction into overall install percent (avoids jumping to 100% mid-batch). */
function overallPercent(
  scope: { fileIndex: number; fileCount: number } | undefined,
  fileFraction: number,
  fileDone: boolean,
): number {
  const fraction = Math.min(1, Math.max(0, fileFraction))
  if (!scope || scope.fileCount <= 1) {
    if (fileDone) return 100
    return Math.min(99, Math.round(fraction * 100))
  }
  const last = scope.fileIndex >= scope.fileCount - 1
  if (fileDone && last) return 100
  const raw = ((scope.fileIndex + (fileDone ? 1 : fraction)) / scope.fileCount) * 100
  return Math.min(99, Math.round(raw))
}

async function downloadToFile(
  url: string,
  dest: string,
  modelId: string,
  fileName: string,
  scope?: { fileIndex: number; fileCount: number },
): Promise<void> {
  // Prefer Electron net.fetch — better redirect / proxy behavior than undici in some builds.
  const response = await net.fetch(url, {
    redirect: 'follow',
    headers: {
      'User-Agent': 'treasure-chest-image-tools/1.0',
      Accept: '*/*',
    },
  })
  if (!response.ok || !response.body) {
    throw new Error(`download_failed_${response.status}:${fileName}:${safeHost(url)}`)
  }
  const total = Number(response.headers.get('content-length') || 0)
  let received = 0
  let lastEmitAt = 0
  let lastPercent = -1
  const meta = {
    fileIndex: scope ? scope.fileIndex + 1 : undefined,
    fileCount: scope?.fileCount,
  }
  emitInstallProgress({
    id: modelId,
    fileName,
    received: 0,
    total,
    percent: overallPercent(scope, 0, false),
    phase: 'start',
    ...meta,
  })

  const nodeStream = Readable.fromWeb(response.body as import('node:stream/web').ReadableStream)
  nodeStream.on('data', (chunk: Buffer | string) => {
    received += typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length
    const fileFraction = total > 0 ? received / total : 0
    const percent = overallPercent(scope, fileFraction, false)
    const now = Date.now()
    // Throttle IPC flood — per-chunk updates make the settings page flicker.
    if (percent === lastPercent && now - lastEmitAt < 200) return
    if (percent !== lastPercent && now - lastEmitAt < 120 && percent < 99) return
    lastEmitAt = now
    lastPercent = percent
    emitInstallProgress({
      id: modelId,
      fileName,
      received,
      total,
      percent,
      phase: 'progress',
      ...meta,
    })
  })

  await pipeline(nodeStream, createWriteStream(dest))
  const donePercent = overallPercent(scope, 1, true)
  emitInstallProgress({
    id: modelId,
    fileName,
    received: total || received,
    total: total || received,
    percent: donePercent,
    phase: donePercent >= 100 ? 'done' : 'progress',
    ...meta,
  })
}

function safeHost(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return 'unknown'
  }
}

async function downloadAssetWithMirrors(
  asset: { fileName: string; urls: string[] },
  dest: string,
  modelId: string,
  scope?: { fileIndex: number; fileCount: number },
): Promise<void> {
  const urls = asset.urls.filter(Boolean)
  if (urls.length === 0) throw new Error(`download_failed_no_url:${asset.fileName}`)

  let lastError: Error | null = null
  for (const url of urls) {
    try {
      logger.info('Downloading vision model asset', { id: modelId, url, dest })
      await downloadToFile(url, dest, modelId, asset.fileName, scope)
      return
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      logger.warn('Vision model mirror failed, trying next', {
        id: modelId,
        url,
        error: lastError.message,
      })
      try {
        if (existsSync(dest)) rmSync(dest, { force: true })
      } catch {
        /* ignore cleanup */
      }
    }
  }
  throw lastError ?? new Error(`download_failed:${asset.fileName}`)
}

const IMGLY_DATA_VERSION = '1.7.0'
const IMGLY_DIST_BASES = [
  `https://staticimgly.com/@imgly/background-removal-data/${IMGLY_DATA_VERSION}/dist/`,
  `https://cdn.jsdelivr.net/npm/@imgly/background-removal-data@${IMGLY_DATA_VERSION}/dist/`,
  `https://unpkg.com/@imgly/background-removal-data@${IMGLY_DATA_VERSION}/dist/`,
]

function clearModelDir(id: string): string {
  const dir = join(modelsRoot(), id)
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true })
  }
  return ensureDir(dir)
}

async function fetchTextWithMirrors(urls: string[]): Promise<{ url: string; text: string }> {
  let lastError: Error | null = null
  for (const url of urls) {
    try {
      const response = await net.fetch(url, {
        redirect: 'follow',
        headers: {
          'User-Agent': 'treasure-chest-image-tools/1.0',
          Accept: '*/*',
        },
      })
      if (!response.ok) {
        throw new Error(`http_${response.status}:${safeHost(url)}`)
      }
      return { url, text: await response.text() }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
    }
  }
  throw lastError ?? new Error('fetch_failed')
}

/** Download IMG.LY CDN bundle into the model dir (resources.json + chunk files). */
async function installImglyCdnBundle(dir: string, modelId: string): Promise<void> {
  emitInstallProgress({
    id: modelId,
    fileName: 'resources.json',
    received: 0,
    total: 0,
    percent: 0,
    phase: 'start',
  })
  const { url: baseUrl, text } = await fetchTextWithMirrors(
    IMGLY_DIST_BASES.map((b) => `${b}resources.json`),
  )
  const base = baseUrl.replace(/resources\.json$/, '')
  writeFileSync(join(dir, 'resources.json'), text, 'utf8')

  const resourceMap = JSON.parse(text) as Record<
    string,
    { chunks?: Array<{ name: string }>; size?: number }
  >
  const chunkNames = new Set<string>()
  for (const entry of Object.values(resourceMap)) {
    for (const chunk of entry.chunks ?? []) {
      if (chunk.name) chunkNames.add(chunk.name)
    }
  }
  if (chunkNames.size === 0) {
    throw new Error('imgly_resources_empty')
  }

  const files = [...chunkNames]
  for (let i = 0; i < files.length; i++) {
    const fileName = files[i]!
    const dest = join(dir, fileName)
    ensureDir(dirname(dest))
    await downloadAssetWithMirrors(
      {
        fileName,
        urls: [new URL(fileName, base).toString()],
      },
      dest,
      modelId,
      { fileIndex: i, fileCount: files.length },
    )
  }

  writeFileSync(
    join(dir, 'README.txt'),
    `Installed via 袖里乾坤 settings.\nModel id: ${modelId}\nSource: ${base}\nFiles: resources.json + ${files.length} chunks\n`,
    'utf8',
  )
}

/** One-click install: wipe then download catalog assets into the models root. */
export async function installVisionModel(id: string): Promise<VisionModelState> {
  const entry = visionCatalogEntry(id)
  if (!entry) throw new Error(`unknown model: ${id}`)
  if (entry.installKind !== 'download') throw new Error(`model ${id} requires import`)

  appendActivity({
    scope: 'image.install',
    level: 'info',
    message: `Install start: ${id}`,
    detail: `assets=${(entry.downloadAssets ?? []).length}`,
  })
  markStatus(id, 'installing')
  try {
    // Always clear first so "重新安装" actually re-downloads instead of instant no-op.
    const dir = clearModelDir(id)
    const assets = entry.downloadAssets ?? []

    if (assets.length === 0) {
      if (id === 'imgly-rembg') {
        await installImglyCdnBundle(dir, id)
      } else {
        throw new Error('no_download_assets')
      }
    } else {
      for (let i = 0; i < assets.length; i++) {
        const asset = assets[i]!
        const dest = join(dir, asset.fileName)
        await downloadAssetWithMirrors(asset, dest, id, {
          fileIndex: i,
          fileCount: assets.length,
        })
      }
      writeFileSync(
        join(dir, 'README.txt'),
        `Installed via 袖里乾坤 settings.\nModel id: ${id}\nFiles: ${assets.map((a) => a.fileName).join(', ')}\n`,
        'utf8',
      )
    }

    const ready = markInstalled(id)
    appendActivity({
      scope: 'image.install',
      level: 'info',
      message: `Install done: ${id}`,
      detail: dir,
    })
    return ready
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error('installVisionModel failed', error)
    appendActivity({
      scope: 'image.install',
      level: 'error',
      message: `Install failed: ${id}`,
      detail: message,
    })
    emitInstallProgress({
      id,
      received: 0,
      total: 0,
      percent: 0,
      phase: 'error',
      error: message,
    })
    return markStatus(id, 'error', message)
  }
}

export async function importVisionModel(id: string): Promise<VisionModelState | null> {
  const entry = visionCatalogEntry(id)
  if (!entry) throw new Error(`unknown model: ${id}`)
  const canImport =
    entry.installKind === 'import' || entry.allowImport === true || entry.importExtensions.length > 0
  if (!canImport) throw new Error(`model ${id} does not support import`)

  const win = BrowserWindow.getFocusedWindow()
  const filters = [
    {
      name: 'Model',
      extensions: entry.importExtensions.length ? entry.importExtensions : ['*'],
    },
  ]
  const result = win
    ? await dialog.showOpenDialog(win, {
        title: `Import ${id}`,
        properties: ['openFile', 'multiSelections'],
        filters,
      })
    : await dialog.showOpenDialog({
        title: `Import ${id}`,
        properties: ['openFile', 'multiSelections'],
        filters,
      })

  if (result.canceled || result.filePaths.length === 0) return null

  markStatus(id, 'installing')
  try {
    const dir = modelDir(id)
    for (const src of result.filePaths) {
      const dest = join(dir, basename(src))
      copyFileSync(src, dest)
    }
    return markInstalled(id)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error('importVisionModel failed', error)
    return markStatus(id, 'error', message)
  }
}

export function uninstallVisionModel(id: string): VisionModelState {
  const dir = join(modelsRoot(), id)
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true })
  }
  const state: VisionModelState = { id, status: 'not_installed' }
  const cur = getImageToolsSettings()
  const models = cur.models.map((m) => (m.id === id ? state : m))
  setSetting(SETTINGS_KEY, persistable({ ...cur, models }))
  return state
}

export function openVisionModelsDir(): string {
  const dir = modelsRoot()
  void shell.openPath(dir)
  return dir
}

export async function pickVisionModelsRoot(): Promise<ImageToolsSettings | null> {
  // Custom roots are disabled; expose the fixed userData models folder instead.
  openVisionModelsDir()
  return getImageToolsSettings()
}

export async function saveImageDialog(payload: ImageSaveRequest): Promise<ImageSaveResult> {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(payload.dataUrl)
  if (!match) return { ok: false, error: 'invalid_data_url' }
  const mime = match[1]
  const b64 = match[2]
  const ext =
    mime.includes('png')
      ? 'png'
      : mime.includes('webp')
        ? 'webp'
        : mime.includes('jpeg') || mime.includes('jpg')
          ? 'jpg'
          : 'png'

  const win = BrowserWindow.getFocusedWindow()
  const result = win
    ? await dialog.showSaveDialog(win, {
        defaultPath: payload.defaultName ?? `image.${ext}`,
        filters: [{ name: 'Image', extensions: [ext, 'png', 'jpg', 'webp'] }],
      })
    : await dialog.showSaveDialog({
        defaultPath: payload.defaultName ?? `image.${ext}`,
        filters: [{ name: 'Image', extensions: [ext, 'png', 'jpg', 'webp'] }],
      })

  if (result.canceled || !result.filePath) return { ok: false, error: 'cancelled' }
  try {
    writeFileSync(result.filePath, Buffer.from(b64, 'base64'))
    return { ok: true, path: result.filePath }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Smart ops that can run in main without browser WASM.
 * remove_background / background_replace are gated here then run in the renderer
 * via local onnxruntime-web (U²-Net or reassembled IMG.LY isnet).
 * Here we also handle denoise + upscale fallbacks.
 */
export async function runSmartInMain(payload: ImageSmartRunRequest): Promise<ImageSmartRunResult> {
  const settings = getImageToolsSettings()
  const resolvedId =
    payload.modelId ??
    settings.taskModelIds[payload.task] ??
    (payload.task === 'remove_background'
      ? 'imgly-rembg'
      : payload.task === 'upscale'
        ? 'realesrgan-x4'
        : payload.task === 'denoise'
          ? 'nafnet'
          : payload.task === 'remove_watermark'
            ? 'lama-inpaint'
            : 'imgly-rembg')

  appendActivity({
    scope: 'image.smart',
    level: 'info',
    message: `Smart gate: ${payload.task}`,
    detail: `model=${resolvedId}`,
  })

  const state = settings.models.find((m) => m.id === resolvedId)
  if (!state || state.status !== 'ready') {
    appendActivity({
      scope: 'image.smart',
      level: 'warn',
      message: `Model not installed: ${resolvedId}`,
      detail: `task=${payload.task} status=${state?.status ?? 'missing'}`,
    })
    return { ok: false, reason: 'model_not_installed', modelId: resolvedId, error: 'model_not_installed' }
  }

  const entry = visionCatalogEntry(resolvedId)

  if (payload.task === 'remove_background' || payload.task === 'background_replace') {
    if (entry?.runtime === 'import_pending') {
      appendActivity({
        scope: 'image.smart',
        level: 'warn',
        message: `Runtime pending: ${resolvedId}`,
        detail: payload.task,
      })
      return {
        ok: false,
        reason: 'unsupported',
        modelId: resolvedId,
        error: 'runtime_pending',
      }
    }
    if (resolvedId === 'birefnet' || resolvedId === 'imgly-rembg') {
      if (resolvedId === 'birefnet') {
        const weight = findOnnxWeight(resolvedId)
        if (!weight) {
          appendActivity({
            scope: 'image.smart',
            level: 'warn',
            message: `ONNX weight missing for ${resolvedId}`,
            detail: state.path ?? modelDir(resolvedId),
          })
          return {
            ok: false,
            reason: 'model_not_installed',
            modelId: resolvedId,
            error: 'model_not_installed',
          }
        }
      }
      if (resolvedId === 'imgly-rembg') {
        const dir = modelDir(resolvedId)
        if (!existsSync(join(dir, 'resources.json')) && !findOnnxWeight(resolvedId)) {
          appendActivity({
            scope: 'image.smart',
            level: 'warn',
            message: `IMG.LY resources missing for ${resolvedId}`,
            detail: dir,
          })
          return {
            ok: false,
            reason: 'model_not_installed',
            modelId: resolvedId,
            error: 'model_not_installed',
          }
        }
      }
    }
    appendActivity({
      scope: 'image.smart',
      level: 'info',
      message: `Gate ok → renderer: ${payload.task}`,
      detail: resolvedId,
    })
    return { ok: true, modelId: resolvedId, imageDataUrl: payload.imageDataUrl }
  }

  if (payload.task === 'remove_watermark') {
    if (entry?.runtime === 'import_pending') {
      appendActivity({
        scope: 'image.smart',
        level: 'warn',
        message: `Runtime pending: ${resolvedId}`,
        detail: payload.task,
      })
      return {
        ok: false,
        reason: 'unsupported',
        modelId: resolvedId,
        error: 'runtime_pending',
      }
    }
    const weight = findOnnxWeight(resolvedId)
    if (!weight) {
      appendActivity({
        scope: 'image.smart',
        level: 'warn',
        message: `LaMa ONNX missing for ${resolvedId} (reinstall lama_fp32.onnx)`,
        detail: state.path ?? modelDir(resolvedId),
      })
      return {
        ok: false,
        reason: 'model_not_installed',
        modelId: resolvedId,
        error: 'model_not_installed',
      }
    }
    appendActivity({
      scope: 'image.smart',
      level: 'info',
      message: `Gate ok → renderer: ${payload.task}`,
      detail: `${resolvedId} file=${weight.fileName}`,
    })
    return { ok: true, modelId: resolvedId, imageDataUrl: payload.imageDataUrl }
  }

  if (payload.task === 'upscale' || payload.task === 'denoise') {
    if (entry?.runtime === 'import_pending') {
      appendActivity({
        scope: 'image.smart',
        level: 'warn',
        message: `Runtime pending: ${resolvedId}`,
        detail: payload.task,
      })
      return {
        ok: false,
        reason: 'unsupported',
        modelId: resolvedId,
        error: 'runtime_pending',
      }
    }
    appendActivity({
      scope: 'image.smart',
      level: 'info',
      message: `Gate ok → canvas fallback: ${payload.task}`,
      detail: resolvedId,
    })
    return { ok: true, modelId: resolvedId, imageDataUrl: payload.imageDataUrl }
  }

  appendActivity({
    scope: 'image.smart',
    level: 'error',
    message: `Unsupported smart task: ${payload.task}`,
  })
  return { ok: false, reason: 'unsupported', error: 'unsupported', modelId: resolvedId }
}

let visionHttpServer: Server | null = null
let visionHttpPort: number | null = null
let visionHttpStarting: Promise<number> | null = null

function contentTypeFor(rel: string): string {
  const lower = rel.toLowerCase()
  if (lower.endsWith('.json')) return 'application/json'
  if (lower.endsWith('.wasm')) return 'application/wasm'
  if (lower.endsWith('.mjs') || lower.endsWith('.js')) return 'text/javascript'
  return 'application/octet-stream'
}

/**
 * Loopback HTTP fallback (packaged / file://). Prefer same-origin /__vision__/ in Vite dev.
 */
export async function startVisionAssetHttpServer(): Promise<number> {
  if (visionHttpServer && visionHttpPort) return visionHttpPort
  if (visionHttpStarting) return visionHttpStarting

  visionHttpStarting = (async () => {
    const server = createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', '*')
      res.setHeader('Access-Control-Allow-Private-Network', 'true')
      if (req.method === 'OPTIONS') {
        res.writeHead(204)
        res.end()
        return
      }
      try {
        const rawPath = decodeURIComponent((req.url || '/').split('?')[0] || '/')
        const parts = rawPath.replace(/^\/+/, '').split('/').filter(Boolean)
        const id = parts[0]
        const rel = parts.slice(1).join('/')
        if (!id || !rel || rel.includes('..')) {
          res.writeHead(400)
          res.end('bad request')
          return
        }
        const filePath = join(modelsRoot(), id, rel)
        if (!existsSync(filePath) || !statSync(filePath).isFile()) {
          res.writeHead(404)
          res.end('not found')
          return
        }
        const data = readFileSync(filePath)
        res.writeHead(200, {
          'Content-Type': contentTypeFor(rel),
          'Content-Length': data.length,
          'Cache-Control': 'public, max-age=31536000, immutable',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Private-Network': 'true',
        })
        res.end(data)
      } catch (error) {
        logger.error('vision http serve failed', error)
        res.writeHead(500)
        res.end('error')
      }
    })

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      // Bind localhost (not 127.0.0.1) so origin can align with Vite's localhost:5173.
      server.listen(0, 'localhost', () => resolve())
    })

    const addr = server.address()
    const port = typeof addr === 'object' && addr ? addr.port : 0
    if (!port) {
      server.close()
      throw new Error('vision_http_bind_failed')
    }
    visionHttpServer = server
    visionHttpPort = port
    logger.info(`vision asset http listening on http://localhost:${port}`)
    return port
  })()

  try {
    return await visionHttpStarting
  } finally {
    visionHttpStarting = null
  }
}

/**
 * Local publicPath for IMG.LY when resources.json is installed.
 * Dev: same-origin `/__vision__/{id}/` (Vite middleware).
 * Prod: `http://localhost:{port}/{id}/`.
 */
export async function getVisionModelPublicPath(id: string): Promise<string | null> {
  const dir = join(modelsRoot(), id)
  if (!existsSync(join(dir, 'resources.json'))) return null
  if (process.env.ELECTRON_RENDERER_URL) {
    return `/__vision__/${id}/`
  }
  const port = await startVisionAssetHttpServer()
  return `http://localhost:${port}/${id}/`
}

/** @deprecated no-op */
export function registerVisionAssetScheme(): void {
  /* intentionally empty */
}

/** @deprecated use startVisionAssetHttpServer */
export function attachVisionAssetProtocol(): void {
  void startVisionAssetHttpServer().catch((error) => {
    logger.error('vision http start failed', error)
  })
}

export function getVisionModelPath(id: string): string {
  return modelDir(id)
}

function findOnnxWeight(id: string): { fileName: string; path: string } | null {
  const dir = modelDir(id)
  if (!existsSync(dir)) return null
  const fileName = readdirSync(dir).find((name) => name.toLowerCase().endsWith('.onnx'))
  if (!fileName) return null
  return { fileName, path: join(dir, fileName) }
}

type ImglyResourceEntry = {
  chunks?: Array<{ name: string; offsets?: [number, number] }>
  size?: number
}

/**
 * Reassemble an IMG.LY chunked resource into a single .onnx cache file.
 * Prefer small quant model for Electron memory / IPC size.
 */
function reassembleImglyOnnx(id: string): VisionModelWeightResult {
  const dir = modelDir(id)
  const resourcesPath = join(dir, 'resources.json')
  if (!existsSync(resourcesPath)) {
    return { ok: false, error: 'imgly_resources_missing' }
  }

  const preferredKeys = ['/models/isnet_quint8', '/models/isnet_fp16', '/models/isnet']
  let resourceMap: Record<string, ImglyResourceEntry>
  try {
    resourceMap = JSON.parse(readFileSync(resourcesPath, 'utf8')) as Record<string, ImglyResourceEntry>
  } catch {
    return { ok: false, error: 'imgly_resources_invalid' }
  }

  const resourceKey = preferredKeys.find((key) => (resourceMap[key]?.chunks?.length ?? 0) > 0)
  if (!resourceKey) {
    return { ok: false, error: 'imgly_model_missing' }
  }

  const entry = resourceMap[resourceKey]!
  const cacheName = `${resourceKey.split('/').pop()}.onnx`
  const cachePath = join(dir, cacheName)
  const expectedSize = typeof entry.size === 'number' ? entry.size : 0

  if (existsSync(cachePath) && (!expectedSize || statSync(cachePath).size === expectedSize)) {
    try {
      const buf = readFileSync(cachePath)
      return { ok: true, modelId: id, fileName: cacheName, data: new Uint8Array(buf) }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  try {
    const parts: Buffer[] = []
    let total = 0
    for (const chunk of entry.chunks ?? []) {
      const chunkPath = join(dir, chunk.name)
      if (!existsSync(chunkPath)) {
        return { ok: false, error: `imgly_chunk_missing:${chunk.name}` }
      }
      const part = readFileSync(chunkPath)
      parts.push(part)
      total += part.length
    }
    if (expectedSize && total !== expectedSize) {
      return { ok: false, error: `imgly_size_mismatch:${total}/${expectedSize}` }
    }
    const buf = Buffer.concat(parts)
    writeFileSync(cachePath, buf)
    logger.info(`imgly reassembled ${resourceKey} → ${cacheName} (${buf.length} bytes)`)
    return { ok: true, modelId: id, fileName: cacheName, data: new Uint8Array(buf) }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export type VisionModelWeightResult =
  | { ok: true; modelId: string; fileName: string; data: Uint8Array }
  | { ok: false; error: string }

/** Read installed ONNX (or reassembled IMG.LY isnet) bytes for renderer-side inference. */
export function readVisionModelWeight(id: string): VisionModelWeightResult {
  const onnx = findOnnxWeight(id)
  if (onnx) {
    try {
      const buf = readFileSync(onnx.path)
      return { ok: true, modelId: id, fileName: onnx.fileName, data: new Uint8Array(buf) }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }
  if (id === 'imgly-rembg') {
    return reassembleImglyOnnx(id)
  }
  return { ok: false, error: 'onnx_not_found' }
}

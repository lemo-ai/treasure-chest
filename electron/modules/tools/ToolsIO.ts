import { writeFile } from 'node:fs/promises'
import { BrowserWindow, dialog } from 'electron'
import { extractTextFromBuffer } from '../knowledge/DocumentExtractor'
import { logger } from '../../utils/logger'

export interface ExtractDocumentResult {
  ok: boolean
  text?: string
  mime?: string
  error?: string
}

export interface SaveTextResult {
  ok: boolean
  path?: string
  error?: string
}

export interface SaveMediaResult {
  ok: boolean
  path?: string
  error?: string
}

export async function extractDocumentFromBase64(payload: {
  fileName: string
  dataBase64: string
  mime?: string
}): Promise<ExtractDocumentResult> {
  try {
    const buf = Buffer.from(payload.dataBase64, 'base64')
    if (buf.byteLength === 0) return { ok: false, error: 'empty file' }
    const { text, mime } = await extractTextFromBuffer(buf, payload.fileName, payload.mime)
    return { ok: true, text, mime }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.warn(`tools extract failed: ${msg}`)
    return { ok: false, error: msg }
  }
}

export async function saveTextDialog(payload: {
  content: string
  defaultName?: string
  extensions?: string[]
}): Promise<SaveTextResult> {
  const exts = payload.extensions?.length ? payload.extensions : ['txt', 'md']
  const win = BrowserWindow.getFocusedWindow()
  const opts = {
    defaultPath: payload.defaultName ?? `document.${exts[0]}`,
    filters: [{ name: 'Document', extensions: exts }],
  }
  const result = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
  if (result.canceled || !result.filePath) return { ok: false, error: 'cancelled' }
  try {
    await writeFile(result.filePath, payload.content, 'utf8')
    return { ok: true, path: result.filePath }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Save remote https / data: media to a user-chosen path. */
export async function saveMediaDialog(payload: {
  url: string
  defaultName?: string
}): Promise<SaveMediaResult> {
  const url = payload.url.trim()
  if (!url) return { ok: false, error: 'empty url' }

  let buf: Buffer
  let ext = 'mp4'
  try {
    if (url.startsWith('data:')) {
      const m = /^data:([^;]+);base64,(.+)$/i.exec(url)
      if (!m) return { ok: false, error: 'invalid_data_url' }
      const mime = m[1].toLowerCase()
      buf = Buffer.from(m[2], 'base64')
      if (mime.includes('webm')) ext = 'webm'
      else if (mime.includes('png')) ext = 'png'
      else if (mime.includes('jpeg') || mime.includes('jpg')) ext = 'jpg'
      else if (mime.includes('mp4')) ext = 'mp4'
    } else {
      const res = await fetch(url, { signal: AbortSignal.timeout(300_000) })
      if (!res.ok) return { ok: false, error: `download HTTP ${res.status}` }
      buf = Buffer.from(await res.arrayBuffer())
      const ct = (res.headers.get('content-type') || '').toLowerCase()
      if (ct.includes('webm')) ext = 'webm'
      else if (ct.includes('quicktime')) ext = 'mov'
      else if (ct.includes('png')) ext = 'png'
      else if (ct.includes('jpeg')) ext = 'jpg'
      const pathGuess = url.split('?')[0]?.toLowerCase() || ''
      if (pathGuess.endsWith('.webm')) ext = 'webm'
      else if (pathGuess.endsWith('.mov')) ext = 'mov'
      else if (pathGuess.endsWith('.png')) ext = 'png'
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }

  if (buf.byteLength === 0) return { ok: false, error: 'empty download' }

  const win = BrowserWindow.getFocusedWindow()
  const opts = {
    defaultPath: payload.defaultName ?? `media.${ext}`,
    filters: [{ name: 'Media', extensions: [ext, 'mp4', 'webm', 'mov', 'png', 'jpg'] }],
  }
  const result = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
  if (result.canceled || !result.filePath) return { ok: false, error: 'cancelled' }
  try {
    await writeFile(result.filePath, buf)
    return { ok: true, path: result.filePath }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

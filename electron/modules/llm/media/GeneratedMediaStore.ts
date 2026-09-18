import { createServer, type Server } from 'node:http'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'
import { app } from 'electron'
import { logger } from '../../../utils/logger'

let mediaHttpServer: Server | null = null
let mediaHttpPort: number | null = null
let mediaHttpStarting: Promise<number> | null = null

function mediaRoot(): string {
  const dir = join(app.getPath('userData'), 'generated-media')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function mimeForExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.webp':
      return 'image/webp'
    case '.gif':
      return 'image/gif'
    case '.mp4':
      return 'video/mp4'
    case '.webm':
      return 'video/webm'
    case '.mp3':
      return 'audio/mpeg'
    case '.wav':
      return 'audio/wav'
    case '.ogg':
      return 'audio/ogg'
    case '.m4a':
      return 'audio/mp4'
    default:
      return 'image/png'
  }
}

function extForMime(mime: string): string {
  const m = mime.toLowerCase().split(';')[0]?.trim() || ''
  if (m === 'image/jpeg') return '.jpg'
  if (m === 'image/webp') return '.webp'
  if (m === 'image/gif') return '.gif'
  if (m === 'video/mp4') return '.mp4'
  if (m === 'video/webm') return '.webm'
  if (m === 'audio/mpeg' || m === 'audio/mp3') return '.mp3'
  if (m === 'audio/wav') return '.wav'
  if (m === 'audio/ogg') return '.ogg'
  if (m === 'audio/mp4' || m === 'audio/m4a') return '.m4a'
  if (m.startsWith('video/')) return '.mp4'
  if (m.startsWith('audio/')) return '.mp3'
  return '.png'
}

export async function startGeneratedMediaHttpServer(): Promise<number> {
  if (mediaHttpServer && mediaHttpPort) return mediaHttpPort
  if (mediaHttpStarting) return mediaHttpStarting

  mediaHttpStarting = (async () => {
    mediaRoot()
    const server = createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*')
      if (req.method === 'OPTIONS') {
        res.writeHead(204)
        res.end()
        return
      }
      try {
        const name = decodeURIComponent((req.url || '/').split('?')[0] || '/').replace(/^\/+/, '')
        if (!name || name.includes('..') || name.includes('/')) {
          res.writeHead(400)
          res.end('bad request')
          return
        }
        const filePath = join(mediaRoot(), name)
        if (!existsSync(filePath) || !statSync(filePath).isFile()) {
          res.writeHead(404)
          res.end('not found')
          return
        }
        const data = readFileSync(filePath)
        res.writeHead(200, {
          'Content-Type': mimeForExt(extname(name)),
          'Content-Length': data.length,
          'Cache-Control': 'public, max-age=31536000, immutable',
        })
        res.end(data)
      } catch (error) {
        logger.error('generated-media http serve failed', error)
        res.writeHead(500)
        res.end('error')
      }
    })

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => resolve())
    })

    const addr = server.address()
    const port = typeof addr === 'object' && addr ? addr.port : 0
    if (!port) {
      server.close()
      throw new Error('generated_media_http_bind_failed')
    }
    mediaHttpServer = server
    mediaHttpPort = port
    logger.info(`generated-media http listening on http://127.0.0.1:${port}`)
    return port
  })()

  try {
    return await mediaHttpStarting
  } finally {
    mediaHttpStarting = null
  }
}

/** Persist media bytes and return a short loopback URL for the renderer. */
export async function persistGeneratedMedia(input: {
  dataUrl?: string
  remoteUrl?: string
  buffer?: Buffer
  mime?: string
}): Promise<string> {
  const port = await startGeneratedMediaHttpServer()
  let buf: Buffer
  let mime = input.mime || 'application/octet-stream'

  if (input.buffer && input.buffer.byteLength > 0) {
    buf = input.buffer
  } else if (input.dataUrl?.startsWith('data:')) {
    const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(input.dataUrl)
    if (!match) throw new Error('invalid data url')
    mime = match[1]?.trim() || mime
    const payload = match[3] || ''
    buf = Buffer.from(payload, match[2] ? 'base64' : 'utf8')
  } else if (input.remoteUrl) {
    const res = await fetch(input.remoteUrl, { signal: AbortSignal.timeout(300_000) })
    if (!res.ok) throw new Error(`Failed to download generated media (HTTP ${res.status})`)
    buf = Buffer.from(await res.arrayBuffer())
    const header = res.headers.get('content-type') || ''
    mime = header.split(';')[0]?.trim() || mime
  } else {
    throw new Error('empty generated media')
  }

  if (buf.byteLength === 0) throw new Error('Generated media download was empty')

  const id = `${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`
  const fileName = `${id}${extForMime(mime)}`
  writeFileSync(join(mediaRoot(), fileName), buf)
  return `http://127.0.0.1:${port}/${fileName}`
}

/** @deprecated use persistGeneratedMedia */
export const persistGeneratedImage = persistGeneratedMedia

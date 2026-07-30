import { BrowserWindow, dialog } from 'electron'
import { copyFileSync, existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { app } from 'electron'
import { settingsStore } from '../settings/SettingsStore'
import { logger } from '../../utils/logger'

const ALLOWED = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])

function assetsDir(): string {
  const dir = join(app.getPath('userData'), 'dial-assets')
  mkdirSync(dir, { recursive: true })
  return dir
}

function mimeFor(ext: string): string {
  switch (ext.toLowerCase()) {
    case '.png':
      return 'image/png'
    case '.webp':
      return 'image/webp'
    case '.gif':
      return 'image/gif'
    default:
      return 'image/jpeg'
  }
}

export function resolveDialBackgroundUrl(path: string | null | undefined): string | null {
  if (!path || !existsSync(path)) return null
  try {
    const ext = extname(path)
    const data = readFileSync(path)
    return `data:${mimeFor(ext)};base64,${data.toString('base64')}`
  } catch (err) {
    logger.warn('failed to read dial background', err)
    return null
  }
}

export async function pickDialBackground(parent?: BrowserWindow | null): Promise<string | null> {
  const options = {
    title: '选择表盘背景图片',
    properties: ['openFile' as const],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
  }
  const result =
    parent && !parent.isDestroyed()
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options)
  if (result.canceled || result.filePaths.length === 0) return null

  const source = result.filePaths[0]
  const ext = extname(source).toLowerCase()
  if (!ALLOWED.has(ext)) return null

  const prev = settingsStore.getDesktopWidget().backgroundImagePath
  const dest = join(assetsDir(), `background${ext}`)
  copyFileSync(source, dest)

  if (prev && prev !== dest && existsSync(prev)) {
    try {
      unlinkSync(prev)
    } catch {
      /* ignore */
    }
  }

  logger.info(`dial background set ${basename(dest)}`)
  return dest
}

export function clearDialBackgroundFile(): void {
  const prev = settingsStore.getDesktopWidget().backgroundImagePath
  if (prev && existsSync(prev)) {
    try {
      unlinkSync(prev)
    } catch {
      /* ignore */
    }
  }
}

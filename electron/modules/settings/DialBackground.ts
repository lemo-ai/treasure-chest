import { BrowserWindow, dialog, app } from 'electron'
import { copyFileSync, existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'
import { settingsStore } from '../settings/SettingsStore'
import { logger } from '../../utils/logger'

const ALLOWED = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])
const MAX_HISTORY = 24

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

function isManagedAsset(path: string): boolean {
  const root = resolve(assetsDir())
  const target = resolve(path)
  return target === root || target.startsWith(`${root}/`) || target.startsWith(`${root}\\`)
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

function pushHistory(path: string): string[] {
  const current = settingsStore.getDesktopWidget().backgroundImageHistory
  const next = [path, ...current.filter((item) => item !== path)].slice(0, MAX_HISTORY)
  return next
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

  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const dest = join(assetsDir(), `bg-${stamp}${ext}`)
  copyFileSync(source, dest)

  const history = pushHistory(dest)
  settingsStore.setDesktopWidget({
    backgroundImagePath: dest,
    backgroundImageHistory: history,
  })

  logger.info(`dial background set ${basename(dest)} (history=${history.length})`)
  return dest
}

/** Stop using a background on the dial; keep the file in history. */
export function clearActiveDialBackground(): void {
  settingsStore.setDesktopWidget({ backgroundImagePath: null })
}

export function selectDialBackground(path: string): boolean {
  if (!path || !existsSync(path) || !isManagedAsset(path)) return false
  const history = pushHistory(path)
  settingsStore.setDesktopWidget({
    backgroundImagePath: path,
    backgroundImageHistory: history,
  })
  return true
}

/** Remove one history entry and delete its file. */
export function deleteDialBackground(path: string): boolean {
  if (!path || !isManagedAsset(path)) return false
  const widget = settingsStore.getDesktopWidget()
  const history = widget.backgroundImageHistory.filter((item) => item !== path)
  const backgroundImagePath = widget.backgroundImagePath === path ? null : widget.backgroundImagePath

  if (existsSync(path)) {
    try {
      unlinkSync(path)
    } catch (err) {
      logger.warn('failed to delete dial background file', err)
    }
  }

  settingsStore.setDesktopWidget({ backgroundImagePath, backgroundImageHistory: history })
  logger.info(`dial background deleted ${basename(path)}`)
  return true
}

/** @deprecated kept for call sites that still import the old name */
export function clearDialBackgroundFile(): void {
  clearActiveDialBackground()
}

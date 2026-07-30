import { app, nativeImage } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { logger } from './logger'

function iconCandidates(): string[] {
  const roots = [
    join(process.cwd(), 'resources'),
    join(app.getAppPath(), 'resources'),
    join(__dirname, '../../resources'),
    join(__dirname, '../../../resources'),
  ]
  // Prefer PNG for dock.setIcon — ICNS is used by the Electron.app bundle patch.
  const names = ['icon.png', 'icon-128.png', 'icon.icns']

  const out: string[] = []
  for (const root of roots) {
    for (const name of names) {
      out.push(join(root, name))
    }
  }
  return out
}

/** Resolve packaged / dev icon paths for window + Dock. */
export function resolveAppIconPath(): string | null {
  for (const path of iconCandidates()) {
    if (existsSync(path)) return path
  }
  return null
}

export function loadAppIcon(): Electron.NativeImage | null {
  const path = resolveAppIconPath()
  if (!path) return null
  const img = nativeImage.createFromPath(path)
  return img.isEmpty() ? null : img
}

/**
 * Best-effort Dock override. On newer macOS this is often ignored for the
 * Electron binary; `scripts/patch-electron-icon.sh` is the reliable path.
 */
export function applyAppDockIcon(): void {
  if (process.platform !== 'darwin' || !app.dock) return
  const path = resolveAppIconPath()
  if (!path) {
    logger.warn('dock icon: no resources/icon.png found')
    return
  }
  try {
    // Path form is more reliable than NativeImage on some Electron builds.
    app.dock.setIcon(path)
    logger.info(`dock icon set: ${path}`)
  } catch (err) {
    const icon = loadAppIcon()
    if (!icon) {
      logger.warn(`dock icon failed: ${String(err)}`)
      return
    }
    app.dock.setIcon(icon)
    logger.info(`dock icon set via NativeImage: ${path}`)
  }
}

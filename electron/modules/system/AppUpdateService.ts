/**
 * App update helpers.
 * Unsigned / ad-hoc mac builds cannot be installed via ShipIt (electron-updater):
 * code signature validation fails. We still check GitHub Releases and guide users
 * to the .dmg. Developer ID–signed builds can download + quitAndInstall.
 */
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { app, BrowserWindow, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import { IpcChannels } from '@shared'
import { logger } from '../../utils/logger'

export const APP_RELEASES_URL = 'https://github.com/lemo-ai/treasure-chest/releases'

export type AppUpdateState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'

export type AppUpdateStatus = {
  state: AppUpdateState
  currentVersion: string
  latestVersion?: string
  progress?: number
  message?: string
  releaseUrl?: string
  /** True when installer can quitAndInstall (updater download finished). */
  canInstall?: boolean
  /** When true, UI should only offer opening the releases page (no in-app download). */
  manualOnly?: boolean
}

type MacSignKind = 'developer-id' | 'adhoc' | 'none' | 'unknown' | 'n/a'

let lastStatus: AppUpdateStatus = {
  state: 'idle',
  currentVersion: app.getVersion(),
  releaseUrl: APP_RELEASES_URL,
}

let configured = false
let lastProgressEmitAt = 0
let lastProgressPct = -1
let cachedMacSign: MacSignKind | null = null

function broadcastStatus(status: AppUpdateStatus): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue
    win.webContents.send(IpcChannels.app.updateStatus, status)
  }
}

function setStatus(partial: Partial<AppUpdateStatus>): AppUpdateStatus {
  lastStatus = {
    ...lastStatus,
    currentVersion: app.getVersion(),
    releaseUrl: APP_RELEASES_URL,
    ...partial,
  }
  broadcastStatus(lastStatus)
  return lastStatus
}

function compareSemver(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map((n) => Number.parseInt(n, 10) || 0)
  const pb = b.replace(/^v/, '').split('.').map((n) => Number.parseInt(n, 10) || 0)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i += 1) {
    const da = pa[i] ?? 0
    const db = pb[i] ?? 0
    if (da > db) return 1
    if (da < db) return -1
  }
  return 0
}

function resolveMacAppBundle(): string | null {
  if (process.platform !== 'darwin') return null
  try {
    const exe = app.getPath('exe')
    const bundle = resolve(dirname(exe), '..', '..')
    return bundle.endsWith('.app') ? bundle : null
  } catch {
    return null
  }
}

/** Detect whether this mac build can be applied via ShipIt / electron-updater. */
export function getMacSignKind(): MacSignKind {
  if (process.platform !== 'darwin') return 'n/a'
  if (cachedMacSign) return cachedMacSign
  const bundle = resolveMacAppBundle()
  if (!bundle) {
    cachedMacSign = 'unknown'
    return cachedMacSign
  }
  try {
    const result = spawnSync('codesign', ['-dv', '--verbose=4', bundle], {
      encoding: 'utf8',
      timeout: 10_000,
    })
    const text = `${result.stdout || ''}\n${result.stderr || ''}`
    if (/Authority=Developer ID Application/i.test(text)) {
      cachedMacSign = 'developer-id'
    } else if (/Signature=adhoc/i.test(text) || /flags=0x[0-9a-f]*\(adhoc\)/i.test(text)) {
      cachedMacSign = 'adhoc'
    } else if (/code object is not signed/i.test(text) || result.status !== 0) {
      cachedMacSign = 'none'
    } else {
      cachedMacSign = 'unknown'
    }
  } catch {
    cachedMacSign = 'unknown'
  }
  logger.info(`mac code sign kind=${cachedMacSign} bundle=${bundle}`)
  return cachedMacSign
}

/** Ad-hoc / unsigned mac apps cannot pass ShipIt signature validation on update. */
function macRequiresManualUpdate(): boolean {
  if (process.platform !== 'darwin') return false
  const kind = getMacSignKind()
  return kind === 'adhoc' || kind === 'none' || kind === 'unknown'
}

async function fetchLatestGithubVersion(): Promise<string | null> {
  const res = await fetch('https://api.github.com/repos/lemo-ai/treasure-chest/releases/latest', {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'treasure-chest-updater',
    },
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`github_releases_${res.status}`)
  const json = (await res.json()) as { tag_name?: string; draft?: boolean }
  if (json.draft) return null
  const tag = String(json.tag_name || '').trim()
  return tag ? tag.replace(/^v/i, '') : null
}

function ensureUpdaterConfigured(): void {
  if (configured) return
  configured = true
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.forceDevUpdateConfig = false
  try {
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'lemo-ai',
      repo: 'treasure-chest',
    })
  } catch (err) {
    logger.warn('autoUpdater.setFeedURL failed', err)
  }

  autoUpdater.on('error', (err) => {
    logger.warn('autoUpdater error', err)
    const code = friendlyUpdateError(err instanceof Error ? err.message : String(err))
    setStatus({
      state: code === 'mac_signature_invalid' || code === 'mac_unsigned_manual' ? 'available' : 'error',
      message: code,
      canInstall: false,
      progress: undefined,
      manualOnly: code === 'mac_signature_invalid' || code === 'mac_unsigned_manual',
    })
  })
  autoUpdater.on('download-progress', (p) => {
    const pct = Math.max(0, Math.min(100, Math.round(p.percent)))
    const now = Date.now()
    if (pct !== 100 && pct !== 0 && pct === lastProgressPct && now - lastProgressEmitAt < 250) {
      return
    }
    lastProgressPct = pct
    lastProgressEmitAt = now
    setStatus({
      state: 'downloading',
      progress: pct,
      canInstall: false,
      message: undefined,
      manualOnly: false,
    })
  })
  autoUpdater.on('update-downloaded', (info) => {
    lastProgressPct = 100
    setStatus({
      state: 'downloaded',
      latestVersion: info.version,
      progress: 100,
      canInstall: true,
      message: undefined,
      manualOnly: false,
    })
  })
}

function isMacZipMissingError(message: string): boolean {
  return /ZIP file not provided/i.test(message)
}

function isMacSignatureError(message: string): boolean {
  return (
    /did not pass validation/i.test(message) ||
    /代码未能满足指定的代码要求/.test(message) ||
    /code failed to satisfy/i.test(message) ||
    /Code signature at URL/i.test(message) ||
    /代码签名/.test(message)
  )
}

function friendlyUpdateError(message: string): string {
  if (isMacZipMissingError(message)) return 'mac_zip_missing'
  if (isMacSignatureError(message)) return 'mac_signature_invalid'
  return message
}

export function getAppUpdateStatus(): AppUpdateStatus {
  return { ...lastStatus, currentVersion: app.getVersion(), releaseUrl: APP_RELEASES_URL }
}

/** Compare local version to GitHub latest; optionally try electron-updater when packaged. */
export async function checkForAppUpdates(): Promise<AppUpdateStatus> {
  setStatus({
    state: 'checking',
    message: undefined,
    progress: undefined,
    canInstall: false,
    manualOnly: false,
  })
  const current = app.getVersion()
  try {
    const latest = await fetchLatestGithubVersion()
    if (!latest) {
      return setStatus({
        state: 'not-available',
        currentVersion: current,
        message: 'no_release',
      })
    }
    if (compareSemver(latest, current) <= 0) {
      return setStatus({
        state: 'not-available',
        currentVersion: current,
        latestVersion: latest,
      })
    }

    // Ad-hoc / unsigned mac: ShipIt will reject the zip even if download succeeds.
    if (app.isPackaged && macRequiresManualUpdate()) {
      logger.info(
        `app update available=${latest} but mac sign=${getMacSignKind()} → manual .dmg only`,
      )
      return setStatus({
        state: 'available',
        currentVersion: current,
        latestVersion: latest,
        message: 'mac_unsigned_manual',
        canInstall: false,
        manualOnly: true,
      })
    }

    const available = setStatus({
      state: 'available',
      currentVersion: current,
      latestVersion: latest,
      canInstall: false,
      manualOnly: false,
    })

    if (app.isPackaged) {
      ensureUpdaterConfigured()
      try {
        await autoUpdater.checkForUpdates()
      } catch (err) {
        const raw = err instanceof Error ? err.message : String(err)
        logger.info(`autoUpdater.checkForUpdates skipped/failed: ${raw}`)
        const code = friendlyUpdateError(raw)
        if (code === 'mac_zip_missing' || code === 'mac_signature_invalid') {
          return setStatus({
            state: 'available',
            currentVersion: current,
            latestVersion: latest,
            message: code,
            canInstall: false,
            manualOnly: true,
          })
        }
      }
    }
    const after = getAppUpdateStatus()
    return after.state === 'idle' ? available : after
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.warn('checkForAppUpdates failed', err)
    return setStatus({
      state: 'error',
      message: friendlyUpdateError(message),
      canInstall: false,
    })
  }
}

export async function downloadAppUpdate(): Promise<AppUpdateStatus> {
  if (!app.isPackaged) {
    return setStatus({
      state: 'error',
      message: 'not_packaged',
      canInstall: false,
    })
  }

  if (macRequiresManualUpdate()) {
    const latest = lastStatus.latestVersion
    return setStatus({
      state: 'available',
      latestVersion: latest,
      message: 'mac_unsigned_manual',
      canInstall: false,
      progress: undefined,
      manualOnly: true,
    })
  }

  ensureUpdaterConfigured()
  lastProgressPct = -1
  lastProgressEmitAt = 0
  setStatus({
    state: 'downloading',
    progress: 0,
    canInstall: false,
    message: undefined,
    manualOnly: false,
  })
  try {
    const result = await autoUpdater.checkForUpdates()
    if (!result?.updateInfo) {
      return setStatus({
        state: 'error',
        message: 'no_update_info',
        canInstall: false,
      })
    }
    logger.info(
      `app update download start version=${result.updateInfo.version} files=${JSON.stringify(
        (result.updateInfo.files || []).map((f) => f.url),
      )}`,
    )
    await autoUpdater.downloadUpdate()
    const done = getAppUpdateStatus()
    if (done.state !== 'downloaded') {
      return setStatus({
        state: 'downloaded',
        latestVersion: result.updateInfo.version,
        progress: 100,
        canInstall: true,
        message: undefined,
        manualOnly: false,
      })
    }
    return done
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err)
    logger.warn('downloadAppUpdate failed', err)
    const code = friendlyUpdateError(raw)
    if (code === 'mac_zip_missing' || code === 'mac_signature_invalid' || code === 'mac_unsigned_manual') {
      return setStatus({
        state: 'available',
        message: code,
        progress: undefined,
        canInstall: false,
        manualOnly: true,
      })
    }
    return setStatus({ state: 'error', message: code, canInstall: false, progress: undefined })
  }
}

export function quitAndInstallAppUpdate(): { ok: boolean; error?: string } {
  try {
    if (macRequiresManualUpdate()) {
      void openAppReleasesPage()
      return { ok: false, error: 'mac_unsigned_manual' }
    }
    ensureUpdaterConfigured()
    const status = getAppUpdateStatus()
    if (!status.canInstall && status.state !== 'downloaded') {
      return { ok: false, error: 'not_downloaded' }
    }
    logger.info('app update quitAndInstall')
    setTimeout(() => {
      try {
        autoUpdater.quitAndInstall(false, true)
      } catch (err) {
        logger.warn('quitAndInstall failed', err)
        const code = friendlyUpdateError(err instanceof Error ? err.message : String(err))
        setStatus({
          state: 'available',
          message: code === 'mac_signature_invalid' ? code : 'install_failed',
          canInstall: false,
          manualOnly: true,
        })
        void openAppReleasesPage()
      }
    }, 200)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function openAppReleasesPage(): Promise<{ ok: boolean }> {
  await shell.openExternal(APP_RELEASES_URL)
  return { ok: true }
}

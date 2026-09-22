/**
 * App update helpers.
 * Unsigned / Gatekeeper-unfriendly builds cannot silently install via electron-updater;
 * we still check GitHub Releases and open the download page. Packaged signed builds can
 * download + quitAndInstall when autoUpdater succeeds.
 */
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
}

let lastStatus: AppUpdateStatus = {
  state: 'idle',
  currentVersion: app.getVersion(),
  releaseUrl: APP_RELEASES_URL,
}

let configured = false
let lastProgressEmitAt = 0
let lastProgressPct = -1

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
  // Allow checking GitHub feed even for ad-hoc / unsigned local builds.
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
    setStatus({
      state: 'error',
      message: friendlyUpdateError(err instanceof Error ? err.message : String(err)),
      canInstall: false,
      progress: undefined,
    })
  })
  autoUpdater.on('download-progress', (p) => {
    const pct = Math.max(0, Math.min(100, Math.round(p.percent)))
    const now = Date.now()
    // Throttle UI pushes; always emit 0 / 100-ish milestones.
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
    })
  })
}

function isMacZipMissingError(message: string): boolean {
  return /ZIP file not provided/i.test(message)
}

function friendlyUpdateError(message: string): string {
  if (isMacZipMissingError(message)) return 'mac_zip_missing'
  return message
}

export function getAppUpdateStatus(): AppUpdateStatus {
  return { ...lastStatus, currentVersion: app.getVersion(), releaseUrl: APP_RELEASES_URL }
}

/** Compare local version to GitHub latest; optionally try electron-updater when packaged. */
export async function checkForAppUpdates(): Promise<AppUpdateStatus> {
  setStatus({ state: 'checking', message: undefined, progress: undefined, canInstall: false })
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

    const available = setStatus({
      state: 'available',
      currentVersion: current,
      latestVersion: latest,
      canInstall: false,
    })

    // Best-effort: packaged builds may also wire autoUpdater for download.
    if (app.isPackaged) {
      ensureUpdaterConfigured()
      try {
        await autoUpdater.checkForUpdates()
      } catch (err) {
        const raw = err instanceof Error ? err.message : String(err)
        logger.info(
          `autoUpdater.checkForUpdates skipped/failed (unsigned builds are expected): ${raw}`,
        )
        if (isMacZipMissingError(raw)) {
          return setStatus({
            state: 'available',
            currentVersion: current,
            latestVersion: latest,
            message: 'mac_zip_missing',
            canInstall: false,
          })
        }
      }
    }
    const after = getAppUpdateStatus()
    return after.state === 'idle' ? available : after
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.warn('checkForAppUpdates failed', err)
    return setStatus({ state: 'error', message: friendlyUpdateError(message), canInstall: false })
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
  ensureUpdaterConfigured()
  lastProgressPct = -1
  lastProgressEmitAt = 0
  setStatus({
    state: 'downloading',
    progress: 0,
    canInstall: false,
    message: undefined,
  })
  try {
    // Re-check so updater has UpdateInfo; then download zip (mac) / nsis (win).
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
      // update-downloaded should have fired; normalize if race.
      return setStatus({
        state: 'downloaded',
        latestVersion: result.updateInfo.version,
        progress: 100,
        canInstall: true,
        message: undefined,
      })
    }
    return done
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err)
    logger.warn('downloadAppUpdate failed', err)
    const code = friendlyUpdateError(raw)
    // Keep "available" so UI still shows open-releases / retry, with a clear reason.
    if (code === 'mac_zip_missing') {
      return setStatus({
        state: 'available',
        message: code,
        progress: undefined,
        canInstall: false,
      })
    }
    return setStatus({ state: 'error', message: code, canInstall: false, progress: undefined })
  }
}

export function quitAndInstallAppUpdate(): { ok: boolean; error?: string } {
  try {
    ensureUpdaterConfigured()
    const status = getAppUpdateStatus()
    if (!status.canInstall && status.state !== 'downloaded') {
      return { ok: false, error: 'not_downloaded' }
    }
    logger.info('app update quitAndInstall')
    // Allow the IPC reply to flush before the process exits.
    setTimeout(() => {
      try {
        autoUpdater.quitAndInstall(false, true)
      } catch (err) {
        logger.warn('quitAndInstall failed', err)
        setStatus({
          state: 'error',
          message: err instanceof Error ? err.message : String(err),
          canInstall: false,
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

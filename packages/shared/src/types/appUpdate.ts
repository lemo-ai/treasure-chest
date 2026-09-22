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
  canInstall?: boolean
  /** Prefer opening the releases page; in-app download/install will not work. */
  manualOnly?: boolean
}
